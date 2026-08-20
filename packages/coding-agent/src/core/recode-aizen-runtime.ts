import {
	type AgentEvent,
	AgentHarness,
	AgentHarnessError,
	type AgentMessage,
	DEFAULT_AGENT_MAX_ITERATIONS,
	Session,
} from "@reitaard/recode-agent-core";
import { NodeExecutionEnv } from "@reitaard/recode-agent-core/node";
import type { AssistantMessage, ImageContent, Models, TextContent, UserMessage } from "@reitaard/recode-ai";
import { isContextOverflow, isRetryableAssistantError } from "@reitaard/recode-ai/compat";
import { getAgentDir } from "../config.ts";
import { sleep } from "../utils/sleep.ts";
import type {
	AgentSession,
	AgentSessionEvent,
	AgentSessionEventListener,
	AizenRuntimeProfile,
} from "./agent-session.ts";
import { calculateContextTokens, shouldCompact } from "./compaction/index.ts";
import { createHarnessModels } from "./harness-models.ts";
import type { CustomMessage } from "./messages.ts";
import { RecodeSessionControlHost } from "./recode-session-control.ts";
import { RecodeSessionStorage } from "./recode-session-storage.ts";
import { emitStartupMilestone } from "./startup-probe.ts";

export interface AizenRuntime {
	harness: AgentHarness;
	profile: AizenRuntimeProfile;
	session: Session;
	prompt(text: string, options?: { images?: ImageContent[] }): Promise<AssistantMessage>;
	sendCustomMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): Promise<void>;
	sendUserMessage(
		content: string | (TextContent | ImageContent)[],
		options?: { deliverAs?: "steer" | "followUp"; expandPromptTemplates?: boolean },
	): Promise<void>;
	appendEntry(customType: string, data?: unknown, options?: { persistImmediately?: boolean }): Promise<void>;
	compact(customInstructions?: string): ReturnType<AgentHarness["compact"]>;
	abortRetry(): void;
	abortCompaction(): ReturnType<AgentHarness["abortCompaction"]>;
	abort(): ReturnType<AgentHarness["abort"]>;
	waitForIdle(): Promise<void>;
	clearQueuedMessages(): ReturnType<AgentHarness["clearQueuedMessages"]>;
	isCompacting(): boolean;
	isRunning(): boolean;
	pendingMessageCount(): number;
	subscribe(listener: AgentSessionEventListener): () => void;
}

export interface CreateAizenRuntimeOptions {
	agentSession: AgentSession;
	cwd: string;
	/** Test/application override. Production resolves the locked model through Recode's registry. */
	models?: Models;
}

function isCompactionAbort(error: unknown): boolean {
	const seen = new Set<unknown>();
	let current = error;
	while (current && !seen.has(current)) {
		seen.add(current);
		if (current instanceof Error) {
			if (
				current.name === "AbortError" ||
				current.message === "Compaction cancelled" ||
				(current as Error & { code?: string }).code === "aborted"
			) {
				return true;
			}
			current = current.cause;
			continue;
		}
		break;
	}
	return false;
}

function customMessageKey<T>(message: Pick<CustomMessage<T>, "customType" | "content">): string {
	try {
		return `${message.customType}\u0000${JSON.stringify(message.content)}`;
	} catch {
		return `${message.customType}\u0000${String(message.content)}`;
	}
}

/** Build one Aizen runtime from Recode-owned configuration and session state. */
export function createAizenRuntime(options: CreateAizenRuntimeOptions): AizenRuntime {
	const profile = options.agentSession.createAizenRuntimeProfile();
	const { hooks, ...harnessProfile } = profile;
	const session = new Session(new RecodeSessionStorage(options.agentSession.sessionManager));
	const models =
		options.models ??
		createHarnessModels(
			[profile.model, profile.compactionModel],
			options.agentSession.modelRegistry,
			"Aizen runtime",
			hooks.beforeProviderHeaders,
		);
	const harness = new AgentHarness({
		env: new NodeExecutionEnv({ cwd: options.cwd }),
		session,
		models,
		...harnessProfile,
		maxIterations: DEFAULT_AGENT_MAX_ITERATIONS,
	});
	harness.on("before_agent_start", hooks.beforeAgentStart);
	harness.on("context", hooks.context);
	harness.on("before_provider_payload", async (event) => {
		emitStartupMilestone("provider-request");
		return await hooks.beforeProviderPayload(event);
	});
	harness.on("after_provider_response", hooks.afterProviderResponse);
	harness.on("tool_call", hooks.toolCall);
	harness.on("tool_result", hooks.toolResult);
	const listeners = new Set<AgentSessionEventListener>();
	let acceptUiMessages = true;
	const emit = (event: AgentSessionEvent): void => {
		for (const listener of listeners) listener(event);
	};
	let pendingAgentEnd: Extract<AgentEvent, { type: "agent_end" }> | undefined;
	let activeCompaction: { reason: "manual" | "threshold" | "overflow"; willRetry: boolean } | undefined;
	let pendingMessageCount = 0;
	let retryAbortController: AbortController | undefined;
	let activeRun: Promise<AssistantMessage> | undefined;
	const activeUiMessageKeys = new Set<string>();
	const sessionControl = new RecodeSessionControlHost(
		getAgentDir(),
		options.agentSession.sessionId,
		options.agentSession.sessionFile,
		() => harness.abort(),
	);
	const flushAgentEnd = (willRetry: boolean): void => {
		if (!pendingAgentEnd) return;
		emit({ ...pendingAgentEnd, willRetry });
		pendingAgentEnd = undefined;
	};
	harness.subscribe(async (event) => {
		if (event.type === "queue_update") {
			pendingMessageCount = event.steer.length + event.followUp.length + event.nextTurn.length;
			emit({
				type: "queue_update",
				steering: event.steer.map(getMessageText),
				followUp: [...event.followUp, ...event.nextTurn].map(getMessageText),
			});
			return;
		}
		if (event.type === "session_compact" && activeCompaction) {
			emit({
				type: "compaction_end",
				reason: activeCompaction.reason,
				result: {
					summary: event.compactionEntry.summary,
					firstKeptEntryId: event.compactionEntry.firstKeptEntryId,
					tokensBefore: event.compactionEntry.tokensBefore,
					details: event.compactionEntry.details,
				},
				aborted: false,
				willRetry: activeCompaction.willRetry,
			});
			activeCompaction = undefined;
			return;
		}
		if (!isAgentLifecycleEvent(event)) return;
		if (event.type === "message_update" && event.message.role === "assistant") {
			sessionControl.setGenerating();
			emitStartupMilestone("first-model-event");
		}
		await hooks.lifecycle?.(event);
		if (event.type === "agent_end") pendingAgentEnd = event;
		else emit(event);
	});
	const recovery = profile.recovery ?? {
		compaction: { enabled: false, reserveTokens: 16384, keepRecentTokens: 20000 },
		retry: { enabled: false, maxRetries: 0, baseDelayMs: 2000 },
	};

	const compactionExecution = {
		model: profile.compactionModel,
		thinkingLevel: profile.compactionThinkingLevel,
	};

	const executeWithRecovery = async (start: () => Promise<AssistantMessage>): Promise<AssistantMessage> => {
		let retryAttempt = 0;
		await sessionControl.start();
		try {
			let response = await start();
			let overflowRecoveryAttempted = false;

			while (response.stopReason === "error") {
				if (isContextOverflow(response, profile.model.contextWindow)) {
					if (overflowRecoveryAttempted || !recovery.compaction.enabled) break;
					overflowRecoveryAttempted = true;
					flushAgentEnd(true);
					emit({ type: "compaction_start", reason: "overflow" });
					activeCompaction = { reason: "overflow", willRetry: true };
					try {
						response = await harness.retry({
							compact: { settings: recovery.compaction, execution: compactionExecution },
						});
					} catch (error) {
						if (activeCompaction) {
							const aborted = isCompactionAbort(error);
							emit({
								type: "compaction_end",
								reason: "overflow",
								result: undefined,
								aborted,
								willRetry: false,
								errorMessage: aborted ? undefined : error instanceof Error ? error.message : String(error),
							});
							activeCompaction = undefined;
						}
						throw error;
					}
					continue;
				}
				if (!recovery.retry.enabled || !isRetryableAssistantError(response)) break;
				if (retryAttempt >= recovery.retry.maxRetries) break;
				flushAgentEnd(true);
				const delayMs = recovery.retry.baseDelayMs * 2 ** retryAttempt;
				retryAttempt++;
				emit({
					type: "auto_retry_start",
					attempt: retryAttempt,
					maxAttempts: recovery.retry.maxRetries,
					delayMs,
					errorMessage: response.errorMessage || "Unknown error",
				});
				retryAbortController = new AbortController();
				try {
					await sleep(delayMs, retryAbortController.signal);
				} catch {
					if (retryAbortController.signal.aborted) break;
					throw new Error("Retry delay failed");
				} finally {
					retryAbortController = undefined;
				}
				response = await harness.retry();
			}

			flushAgentEnd(false);
			if (retryAttempt > 0) {
				emit({
					type: "auto_retry_end",
					success: response.stopReason !== "error",
					attempt: retryAttempt,
					finalError: response.stopReason === "error" ? response.errorMessage : undefined,
				});
			}

			if (
				recovery.compaction.enabled &&
				response.stopReason !== "aborted" &&
				response.usage &&
				shouldCompact(calculateContextTokens(response.usage), profile.model.contextWindow, recovery.compaction)
			) {
				emit({ type: "compaction_start", reason: "threshold" });
				activeCompaction = { reason: "threshold", willRetry: false };
				try {
					await harness.compact(undefined, recovery.compaction, compactionExecution);
				} catch (error) {
					if (activeCompaction) {
						const aborted = isCompactionAbort(error);
						emit({
							type: "compaction_end",
							reason: "threshold",
							result: undefined,
							aborted,
							willRetry: false,
							errorMessage: aborted ? undefined : error instanceof Error ? error.message : String(error),
						});
						activeCompaction = undefined;
					}
				}
			}

			return response;
		} finally {
			flushAgentEnd(false);
			await hooks.settled?.();
			emit({ type: "agent_settled" });
			await sessionControl.stop().catch(() => undefined);
		}
	};
	const runWithRecovery = (start: () => Promise<AssistantMessage>): Promise<AssistantMessage> => {
		if (activeRun) throw new AgentHarnessError("busy", "Aizen runtime is busy");
		const run = executeWithRecovery(start);
		activeRun = run;
		const clearActiveRun = (): void => {
			if (activeRun === run) {
				activeRun = undefined;
				activeUiMessageKeys.clear();
			}
		};
		void run.then(clearActiveRun, clearActiveRun);
		return run;
	};
	const waitForRun = async (run: Promise<AssistantMessage>): Promise<void> => {
		await run.catch(() => undefined);
	};
	const prompt = async (text: string, promptOptions?: { images?: ImageContent[] }): Promise<AssistantMessage> => {
		acceptUiMessages = true;
		emitStartupMilestone("prompt-accepted");
		return await runWithRecovery(async () => await harness.prompt(text, promptOptions));
	};

	const sendCustomMessage = async <T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		messageOptions?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): Promise<void> => {
		const isUiMessage = message.customType.startsWith("mcp-ui-");
		if (!acceptUiMessages && isUiMessage) return;
		const uiMessageKey = isUiMessage ? customMessageKey(message) : undefined;
		if (activeRun && uiMessageKey && activeUiMessageKeys.has(uiMessageKey)) return;
		if (activeRun && uiMessageKey) activeUiMessageKeys.add(uiMessageKey);
		const appMessage: CustomMessage<T> = {
			role: "custom",
			customType: message.customType,
			content: message.content ?? [],
			display: message.display,
			details: message.details,
			timestamp: Date.now(),
		};
		if (messageOptions?.deliverAs === "nextTurn") {
			await harness.nextTurnMessage(appMessage);
		} else if (activeRun && messageOptions?.triggerTurn !== false) {
			const currentRun = activeRun;
			try {
				if (messageOptions?.deliverAs === "followUp") await harness.followUpMessage(appMessage);
				else await harness.steerMessage(appMessage);
			} catch (error) {
				if (!(error instanceof AgentHarnessError) || error.code !== "invalid_state") throw error;
				await waitForRun(currentRun);
				await sendCustomMessage(message, messageOptions);
			}
		} else if (messageOptions?.triggerTurn) {
			await runWithRecovery(async () => await harness.sendMessage(appMessage));
		} else {
			await harness.appendMessage(appMessage);
			emit({ type: "message_start", message: appMessage });
			emit({ type: "message_end", message: appMessage });
		}
	};
	const sendUserMessage = async (
		content: string | (TextContent | ImageContent)[],
		messageOptions?: { deliverAs?: "steer" | "followUp"; expandPromptTemplates?: boolean },
	): Promise<void> => {
		acceptUiMessages = true;
		let parts = typeof content === "string" ? [{ type: "text" as const, text: content }] : content;
		if (messageOptions?.expandPromptTemplates) {
			const text = parts
				.filter((part): part is TextContent => part.type === "text")
				.map((part) => part.text)
				.join("\n");
			const images = parts.filter((part): part is ImageContent => part.type === "image");
			const prepared = await options.agentSession.prepareExtensionUserMessage(
				text,
				images,
				activeRun ? messageOptions.deliverAs : undefined,
			);
			if (prepared.handled) return;
			parts = [
				{ type: "text" as const, text: prepared.text },
				...(prepared.images ?? []),
			];
		}
		const userMessage: UserMessage = { role: "user", content: parts, timestamp: Date.now() };
		if (!activeRun) {
			await runWithRecovery(async () => await harness.sendMessage(userMessage));
			return;
		}
		const currentRun = activeRun;
		try {
			if (messageOptions?.deliverAs === "followUp") await harness.followUpMessage(userMessage);
			else await harness.steerMessage(userMessage);
		} catch (error) {
			if (!(error instanceof AgentHarnessError) || error.code !== "invalid_state") throw error;
			await waitForRun(currentRun);
			await sendUserMessage(content, messageOptions);
		}
	};
	const appendEntry = async (
		customType: string,
		data?: unknown,
		entryOptions?: { persistImmediately?: boolean },
	): Promise<void> => {
		const entryId = await session.appendCustomEntry(customType, data);
		if (entryOptions?.persistImmediately) options.agentSession.sessionManager.flush();
		const entry = await session.getEntry(entryId);
		if (entry) emit({ type: "entry_appended", entry });
	};
	const compactSession = async (customInstructions?: string): ReturnType<AgentHarness["compact"]> => {
		emit({ type: "compaction_start", reason: "manual" });
		activeCompaction = { reason: "manual", willRetry: false };
		try {
			return await harness.compact(customInstructions, recovery.compaction, compactionExecution);
		} catch (error) {
			if (activeCompaction) {
				const aborted = isCompactionAbort(error);
				emit({
					type: "compaction_end",
					reason: "manual",
					result: undefined,
					aborted,
					willRetry: false,
					errorMessage: aborted ? undefined : error instanceof Error ? error.message : String(error),
				});
				activeCompaction = undefined;
			}
			throw error;
		}
	};

	const abort = async (): Promise<Awaited<ReturnType<AgentHarness["abort"]>>> => {
		acceptUiMessages = false;
		return await harness.abort();
	};

	return {
		harness,
		profile,
		session,
		prompt,
		sendCustomMessage,
		sendUserMessage,
		appendEntry,
		compact: compactSession,
		abortRetry: () => retryAbortController?.abort(),
		abortCompaction: () => harness.abortCompaction(),
		abort,
		waitForIdle: () => harness.waitForIdle(),
		clearQueuedMessages: () => harness.clearQueuedMessages(),
		isCompacting: () => activeCompaction !== undefined,
		isRunning: () => activeRun !== undefined,
		pendingMessageCount: () => pendingMessageCount,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

function getMessageText(message: AgentMessage): string {
	if (!("content" in message)) return "";
	if (typeof message.content === "string") return message.content;
	return message.content
		.filter((content) => content.type === "text")
		.map((content) => content.text ?? "")
		.join("\n");
}

function isAgentLifecycleEvent(event: { type: string }): event is AgentEvent {
	return (
		event.type === "agent_start" ||
		event.type === "agent_end" ||
		event.type === "follow_up_start" ||
		event.type === "turn_start" ||
		event.type === "turn_end" ||
		event.type === "message_start" ||
		event.type === "message_update" ||
		event.type === "message_end" ||
		event.type === "tool_execution_start" ||
		event.type === "tool_execution_update" ||
		event.type === "tool_execution_end"
	);
}
