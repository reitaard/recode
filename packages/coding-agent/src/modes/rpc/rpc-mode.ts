/**
 * RPC mode: Headless operation with JSON stdin/stdout protocol.
 *
 * Used for embedding the agent in other applications.
 * Receives commands as JSON on stdin, outputs events and responses as JSON on stdout.
 *
 * Protocol:
 * - Commands: JSON objects with `type` field, optional `id` for correlation
 * - Responses: JSON objects with `type: "response"`, `command`, `success`, and optional `data`/`error`
 * - Events: AgentSessionEvent objects streamed as they occur
 * - Extension UI: Extension UI requests are emitted, client responds with extension_ui_response
 */

import * as crypto from "node:crypto";
import { formatPromptTemplateInvocation, formatSkillInvocation, parseCommandArgs } from "@reitaard/recode-agent-core";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.ts";
import { formatNoApiKeyFoundMessage } from "../../core/auth-guidance.ts";
import type {
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
	WorkingIndicatorOptions,
} from "../../core/extensions/index.ts";
import {
	deliverMaestroCompletionHandoff,
	MAESTRO_COMPLETION_CUSTOM_TYPE,
} from "../../core/maestro-completion-handoff.ts";
import {
	flushRawStdout,
	takeOverStdout,
	waitForRawStdoutBackpressure,
	writeRawStdout,
} from "../../core/output-guard.ts";
import { type AizenRuntime, createAizenRuntime } from "../../core/recode-aizen-runtime.ts";
import { killTrackedDetachedChildren } from "../../utils/shell.ts";
import { type Theme, theme } from "../interactive/theme/theme.ts";
import { attachJsonlLineReader, serializeJsonLine } from "./jsonl.ts";
import type {
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
	RpcSessionState,
	RpcSlashCommand,
} from "./rpc-types.ts";

// Re-export types for consumers
export type {
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
	RpcSessionState,
} from "./rpc-types.ts";

/**
 * Run in RPC mode.
 * Listens for JSON commands on stdin, outputs events and responses on stdout.
 */
export interface RpcModeOptions {
	aizenRuntime?: boolean;
}

interface RpcModeDependencies {
	createAizenRuntime: typeof createAizenRuntime;
}

const defaultDependencies: RpcModeDependencies = { createAizenRuntime };

function expandAizenCommand(text: string, runtime: AizenRuntime): string {
	if (!text.startsWith("/")) return text;
	const spaceIndex = text.indexOf(" ");
	const name = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
	const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();
	if (name.startsWith("skill:")) {
		const skill = runtime.profile.resources.skills?.find((candidate) => candidate.name === name.slice(6));
		return skill ? formatSkillInvocation(skill, args || undefined) : text;
	}
	const template = runtime.profile.resources.promptTemplates?.find((candidate) => candidate.name === name);
	return template ? formatPromptTemplateInvocation(template, parseCommandArgs(args)) : text;
}

export async function runRpcMode(
	runtimeHost: AgentSessionRuntime,
	options: RpcModeOptions = {},
	dependencies: RpcModeDependencies = defaultDependencies,
): Promise<never> {
	takeOverStdout();
	let session = runtimeHost.session;
	let unsubscribe: (() => void) | undefined;
	let unsubscribeAizen: (() => void) | undefined;
	let unsubscribeBackpressure: (() => void) | undefined;
	let aizen: AizenRuntime | undefined;
	let aizenRebuildPending = false;
	const assertAizenSessionIdle = (): void => {
		if (aizen?.isRunning()) {
			throw new Error("Cannot replace the session while Aizen is processing; abort the active run first");
		}
	};

	const output = (obj: RpcResponse | RpcExtensionUIRequest | object) => {
		writeRawStdout(serializeJsonLine(obj));
	};

	const success = <T extends RpcCommand["type"]>(
		id: string | undefined,
		command: T,
		data?: object | null,
	): RpcResponse => {
		if (data === undefined) {
			return { id, type: "response", command, success: true } as RpcResponse;
		}
		return { id, type: "response", command, success: true, data } as RpcResponse;
	};

	const error = (id: string | undefined, command: string, message: string): RpcResponse => {
		return { id, type: "response", command, success: false, error: message };
	};

	// Pending extension UI requests waiting for response
	const pendingExtensionRequests = new Map<
		string,
		{ resolve: (value: any) => void; reject: (error: Error) => void }
	>();

	// Shutdown request flag
	let shutdownRequested = false;
	let shuttingDown = false;
	const signalCleanupHandlers: Array<() => void> = [];

	/** Helper for dialog methods with signal/timeout support */
	function createDialogPromise<T>(
		opts: ExtensionUIDialogOptions | undefined,
		defaultValue: T,
		request: Record<string, unknown>,
		parseResponse: (response: RpcExtensionUIResponse) => T,
	): Promise<T> {
		if (opts?.signal?.aborted) return Promise.resolve(defaultValue);

		const id = crypto.randomUUID();
		return new Promise((resolve, reject) => {
			let timeoutId: ReturnType<typeof setTimeout> | undefined;

			const cleanup = () => {
				if (timeoutId) clearTimeout(timeoutId);
				opts?.signal?.removeEventListener("abort", onAbort);
				pendingExtensionRequests.delete(id);
			};

			const onAbort = () => {
				cleanup();
				resolve(defaultValue);
			};
			opts?.signal?.addEventListener("abort", onAbort, { once: true });

			if (opts?.timeout) {
				timeoutId = setTimeout(() => {
					cleanup();
					resolve(defaultValue);
				}, opts.timeout);
			}

			pendingExtensionRequests.set(id, {
				resolve: (response: RpcExtensionUIResponse) => {
					cleanup();
					resolve(parseResponse(response));
				},
				reject,
			});
			output({ type: "extension_ui_request", id, ...request } as RpcExtensionUIRequest);
		});
	}

	/**
	 * Create an extension UI context that uses the RPC protocol.
	 */
	const createExtensionUIContext = (): ExtensionUIContext => ({
		select: (title, options, opts) =>
			createDialogPromise(opts, undefined, { method: "select", title, options, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? undefined : "value" in r ? r.value : undefined,
			),

		confirm: (title, message, opts) =>
			createDialogPromise(opts, false, { method: "confirm", title, message, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? false : "confirmed" in r ? r.confirmed : false,
			),

		input: (title, placeholder, opts) =>
			createDialogPromise(opts, undefined, { method: "input", title, placeholder, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? undefined : "value" in r ? r.value : undefined,
			),

		notify(message: string, type?: "info" | "warning" | "error"): void {
			// Fire and forget - no response needed
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "notify",
				message,
				notifyType: type,
			} as RpcExtensionUIRequest);
		},

		onTerminalInput(): () => void {
			// Raw terminal input not supported in RPC mode
			return () => {};
		},

		setStatus(key: string, text: string | undefined): void {
			// Fire and forget - no response needed
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "setStatus",
				statusKey: key,
				statusText: text,
			} as RpcExtensionUIRequest);
		},

		setWorkingMessage(_message?: string): void {
			// Working message not supported in RPC mode - requires TUI loader access
		},

		setWorkingVisible(_visible: boolean): void {
			// Working visibility not supported in RPC mode - requires TUI loader access
		},

		setWorkingIndicator(_options?: WorkingIndicatorOptions): void {
			// Working indicator customization not supported in RPC mode - requires TUI loader access
		},

		setHiddenThinkingLabel(_label?: string): void {
			// Hidden thinking label not supported in RPC mode - requires TUI message rendering access
		},

		setWidget(key: string, content: unknown, options?: ExtensionWidgetOptions): void {
			// Only support string arrays in RPC mode - factory functions are ignored
			if (content === undefined || Array.isArray(content)) {
				output({
					type: "extension_ui_request",
					id: crypto.randomUUID(),
					method: "setWidget",
					widgetKey: key,
					widgetLines: content as string[] | undefined,
					widgetPlacement: options?.placement,
				} as RpcExtensionUIRequest);
			}
			// Component factories are not supported in RPC mode - would need TUI access
		},

		setFooter(_factory: unknown): void {
			// Custom footer not supported in RPC mode - requires TUI access
		},

		setHeader(_factory: unknown): void {
			// Custom header not supported in RPC mode - requires TUI access
		},

		setTitle(title: string): void {
			// Fire and forget - host can implement terminal title control
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "setTitle",
				title,
			} as RpcExtensionUIRequest);
		},

		async custom() {
			// Custom UI not supported in RPC mode
			return undefined as never;
		},

		pasteToEditor(text: string): void {
			// Paste handling not supported in RPC mode - falls back to setEditorText
			this.setEditorText(text);
		},

		setEditorText(text: string): void {
			// Fire and forget - host can implement editor control
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "set_editor_text",
				text,
			} as RpcExtensionUIRequest);
		},

		getEditorText(): string {
			// Synchronous method can't wait for RPC response
			// Host should track editor state locally if needed
			return "";
		},

		async editor(title: string, prefill?: string): Promise<string | undefined> {
			const id = crypto.randomUUID();
			return new Promise((resolve, reject) => {
				pendingExtensionRequests.set(id, {
					resolve: (response: RpcExtensionUIResponse) => {
						if ("cancelled" in response && response.cancelled) {
							resolve(undefined);
						} else if ("value" in response) {
							resolve(response.value);
						} else {
							resolve(undefined);
						}
					},
					reject,
				});
				output({ type: "extension_ui_request", id, method: "editor", title, prefill } as RpcExtensionUIRequest);
			});
		},

		addAutocompleteProvider(): void {
			// Autocomplete provider composition is not supported in RPC mode
		},

		setEditorComponent(): void {
			// Custom editor components not supported in RPC mode
		},

		getEditorComponent() {
			// Custom editor components not supported in RPC mode
			return undefined;
		},

		get theme() {
			return theme;
		},

		getAllThemes() {
			return [];
		},

		getTheme(_name: string) {
			return undefined;
		},

		setTheme(_theme: string | Theme) {
			// Theme switching not supported in RPC mode
			return { success: false, error: "Theme switching not supported in RPC mode" };
		},

		getToolsExpanded() {
			// Tool expansion not supported in RPC mode - no TUI
			return false;
		},

		setToolsExpanded(_expanded: boolean) {
			// Tool expansion not supported in RPC mode - no TUI
		},
	});

	runtimeHost.setRebindSession(async () => {
		await rebindSession();
	});

	const bindAizenRuntime = (): void => {
		unsubscribeAizen?.();
		unsubscribeBackpressure?.();
		aizen = dependencies.createAizenRuntime({ agentSession: session, cwd: session.sessionManager.getCwd() });
		unsubscribeAizen = aizen.subscribe((event) => {
			output(event);
			if (event.type === "agent_settled") {
				if (aizenRebuildPending) void rebuildAizenRuntime();
				void checkShutdownRequested();
			}
		});
		unsubscribeBackpressure = aizen.harness.subscribe(async () => {
			await waitForRawStdoutBackpressure();
		});
	};

	const rebindSession = async (): Promise<void> => {
		runtimeHost.readiness.markPending("integration-ready");
		session = runtimeHost.session;
		unsubscribe?.();
		unsubscribeAizen?.();
		unsubscribeBackpressure?.();
		if (options.aizenRuntime) {
			bindAizenRuntime();
		} else {
			aizen = undefined;
			unsubscribeAizen = undefined;
			unsubscribeBackpressure = session.agent.subscribe(async () => {
				await waitForRawStdoutBackpressure();
			});
		}
		await session.bindExtensions({
			uiContext: createExtensionUIContext(),
			mode: "rpc",
			commandContextActions: {
				waitForIdle: () => session.waitForIdle(),
				newSession: async (options) => {
					assertAizenSessionIdle();
					return runtimeHost.newSession(options);
				},
				fork: async (entryId, forkOptions) => {
					assertAizenSessionIdle();
					const result = await runtimeHost.fork(entryId, forkOptions);
					return { cancelled: result.cancelled };
				},
				navigateTree: async (targetId, options) => {
					assertAizenSessionIdle();
					const result = await session.navigateTree(targetId, {
						summarize: options?.summarize,
						customInstructions: options?.customInstructions,
						replaceInstructions: options?.replaceInstructions,
						label: options?.label,
					});
					return { cancelled: result.cancelled };
				},
				switchSession: async (sessionPath, options) => {
					assertAizenSessionIdle();
					return runtimeHost.switchSession(sessionPath, options);
				},
				reload: async () => {
					assertAizenSessionIdle();
					await session.reload();
				},
			},
			shutdownHandler: () => {
				shutdownRequested = true;
			},
			onError: (err) => {
				output({ type: "extension_error", extensionPath: err.extensionPath, event: err.event, error: err.error });
			},
			runtimeActions: options.aizenRuntime
				? {
						sendMessage: (message, sendOptions) => {
							const active = aizen;
							if (!active) return;
							void active.sendCustomMessage(message, sendOptions).catch((cause) =>
								output({
									type: "extension_error",
									extensionPath: "<runtime>",
									event: "send_message",
									error: cause instanceof Error ? cause.message : String(cause),
								}),
							);
						},
						sendUserMessage: (content, sendOptions) => {
							const active = aizen;
							if (!active) return;
							void active.sendUserMessage(content, sendOptions).catch((cause) =>
								output({
									type: "extension_error",
									extensionPath: "<runtime>",
									event: "send_user_message",
									error: cause instanceof Error ? cause.message : String(cause),
								}),
							);
						},
						appendEntry: (customType, data, entryOptions) => {
							void aizen?.appendEntry(customType, data, entryOptions).catch((cause) =>
								output({
									type: "extension_error",
									extensionPath: "<runtime>",
									event: "append_entry",
									error: cause instanceof Error ? cause.message : String(cause),
								}),
							);
						},
					}
				: undefined,
		});

		unsubscribe = session.subscribe((event) => {
			output(event);
			if (event.type === "agent_settled") {
				void checkShutdownRequested();
			}
		});
		const packageRuntimeDiagnostics = session.resourceLoader.getExtensions().packageRuntimeDiagnostics ?? [];
		if (!packageRuntimeDiagnostics.some((diagnostic) => diagnostic.readinessState === "pending")) {
			runtimeHost.readiness.markReady("integration-ready");
		}
	};

	const rebuildAizenRuntime = async (): Promise<void> => {
		if (!options.aizenRuntime) return;
		if (aizen?.isRunning()) {
			aizenRebuildPending = true;
			return;
		}
		aizenRebuildPending = false;
		bindAizenRuntime();
	};

	const registerSignalHandlers = (): void => {
		const signals: NodeJS.Signals[] = ["SIGTERM"];
		if (process.platform !== "win32") {
			signals.push("SIGHUP");
		}

		for (const signal of signals) {
			const handler = () => {
				killTrackedDetachedChildren();
				void shutdown(signal === "SIGHUP" ? 129 : 143, signal);
			};
			process.on(signal, handler);
			signalCleanupHandlers.push(() => process.off(signal, handler));
		}
	};

	await rebindSession();
	registerSignalHandlers();

	// Handle a single command
	const handleCommand = async (command: RpcCommand): Promise<RpcResponse | undefined> => {
		const id = command.id;

		switch (command.type) {
			// =================================================================
			// Prompting
			// =================================================================

			case "prompt": {
				if (aizen) {
					if (command.message.startsWith("/")) {
						const commandName = command.message.slice(1).split(/\s/, 1)[0] ?? "";
						if (session.extensionRunner.getCommand(commandName)) {
							await session.prompt(command.message, { source: "rpc" });
							return success(id, "prompt");
						}
					}
					const inputResult = await session.extensionRunner.emitInput(
						command.message,
						command.images,
						"rpc",
						command.streamingBehavior,
					);
					if (inputResult.action === "handled") return success(id, "prompt");
					let message = inputResult.action === "transform" ? inputResult.text : command.message;
					const images =
						inputResult.action === "transform" ? (inputResult.images ?? command.images) : command.images;
					message = expandAizenCommand(message, aizen);
					if (aizen.isRunning()) {
						if (!command.streamingBehavior) {
							return error(id, "prompt", "Aizen is already processing; choose steer or followUp");
						}
						if (command.streamingBehavior === "followUp") {
							await aizen.harness.followUp(message, { images });
						} else {
							await aizen.harness.steer(message, { images });
						}
						return success(id, "prompt");
					}

					if (!session.modelRegistry.hasConfiguredAuth(aizen.profile.model)) {
						return error(id, "prompt", formatNoApiKeyFoundMessage(aizen.profile.model.provider));
					}
					const activeAizen = aizen;
					void activeAizen
						.prompt(message, { images })
						.catch((promptError: unknown) => {
							console.error(promptError instanceof Error ? promptError.message : String(promptError));
						})
						.finally(() => void checkShutdownRequested());
					return success(id, "prompt");
				}

				// Start prompt handling immediately, but emit the authoritative response only after
				// prompt preflight succeeds. Queued and immediately handled prompts also count as success.
				let preflightSucceeded = false;
				void session
					.prompt(command.message, {
						images: command.images,
						streamingBehavior: command.streamingBehavior,
						source: "rpc",
						preflightResult: (didSucceed) => {
							if (didSucceed) {
								preflightSucceeded = true;
								output(success(id, "prompt"));
							}
						},
					})
					.catch((e) => {
						if (!preflightSucceeded) {
							output(error(id, "prompt", e.message));
						}
					});
				return undefined;
			}

			case "steer": {
				if (aizen) {
					await aizen.harness.steer(expandAizenCommand(command.message, aizen), { images: command.images });
					return success(id, "steer");
				}
				await session.steer(command.message, command.images);
				return success(id, "steer");
			}

			case "follow_up": {
				if (aizen) {
					await aizen.harness.followUp(expandAizenCommand(command.message, aizen), {
						images: command.images,
					});
					return success(id, "follow_up");
				}
				await session.followUp(command.message, command.images);
				return success(id, "follow_up");
			}

			case "abort": {
				if (aizen) {
					aizen.abortRetry();
					await aizen.harness.abort();
					return success(id, "abort");
				}
				await session.abort();
				return success(id, "abort");
			}

			case "new_session": {
				assertAizenSessionIdle();
				const options = command.parentSession ? { parentSession: command.parentSession } : undefined;
				const result = await runtimeHost.newSession(options);
				return success(id, "new_session", result);
			}

			case "maestro_completion_handoff": {
				if (!aizen) {
					return error(id, "maestro_completion_handoff", "completion handoff requires the Aizen runtime");
				}
				const sessionManager = session.sessionManager;
				const result = deliverMaestroCompletionHandoff(
					{
						deliveryId: command.deliveryId,
						childInstanceId: command.childInstanceId,
						childSessionId: command.childSessionId,
						terminalState: command.terminalState,
						summary: command.summary,
						resultHash: command.resultHash,
						completedAt: command.completedAt,
					},
					{
						isRunning: () => aizen?.isRunning() ?? true,
						isPersisted: () => sessionManager.isPersisted(),
						entries: () => {
							const leafId = sessionManager.getLeafId();
							return leafId ? sessionManager.getBranch(leafId) : [];
						},
						append: (content, details) => {
							sessionManager.appendCustomMessageEntry(MAESTRO_COMPLETION_CUSTOM_TYPE, content, false, details);
						},
						flush: () => sessionManager.flush(),
					},
				);
				return success(id, "maestro_completion_handoff", result);
			}

			case "external_event": {
				if (!aizen) {
					return error(id, "external_event", "external_event requires the Aizen runtime");
				}

				const source = command.source.trim();
				const eventName = command.event.trim();
				const summary = command.summary?.trim();

				if (!/^[A-Za-z0-9._-]{1,64}$/.test(source)) {
					return error(id, "external_event", "source must match [A-Za-z0-9._-] and be 1-64 characters");
				}
				if (!/^[A-Za-z0-9._-]{1,128}$/.test(eventName)) {
					return error(id, "external_event", "event must match [A-Za-z0-9._-] and be 1-128 characters");
				}
				if (command.jobId && command.jobId.length > 256) {
					return error(id, "external_event", "jobId must be at most 256 characters");
				}
				if (summary && summary.length > 4000) {
					return error(id, "external_event", "summary must be at most 4000 characters");
				}
				if (command.triggerTurn && command.deliverAs === "nextTurn") {
					return error(id, "external_event", "triggerTurn cannot be combined with deliverAs=nextTurn");
				}

				const shouldPersist = command.persist !== false;
				const shouldDeliver = command.modelVisible === true || command.triggerTurn === true;

				if (!shouldPersist && !shouldDeliver) {
					return error(
						id,
						"external_event",
						"external_event must persist, become model-visible, or trigger a turn",
					);
				}

				const payload = {
					schemaVersion: 1,
					source,
					event: eventName,
					jobId: command.jobId,
					severity: command.severity ?? "info",
					summary,
					details: command.details,
					receivedAt: new Date().toISOString(),
				};

				const customType = `recode.external.${source}`;

				if (shouldPersist) {
					await aizen.appendEntry(customType, payload, {
						persistImmediately: true,
					});
				}

				if (shouldDeliver) {
					await aizen.sendCustomMessage(
						{
							customType,
							content: summary || `External ${source} event: ${eventName}`,
							display: false,
							details: payload,
						},
						{
							triggerTurn: command.triggerTurn === true,
							deliverAs: command.deliverAs ?? "followUp",
						},
					);
				}

				return success(id, "external_event", {
					persisted: shouldPersist,
					modelVisible: shouldDeliver,
					triggerRequested: command.triggerTurn === true,
				});
			}

			// =================================================================
			// State
			// =================================================================

			case "get_state": {
				const state: RpcSessionState = {
					model: aizen?.profile.model ?? session.model,
					thinkingLevel: aizen?.harness.getThinkingLevel() ?? session.thinkingLevel,
					isStreaming: aizen ? aizen.isRunning() : session.isStreaming,
					isCompacting: aizen?.isCompacting() ?? session.isCompacting,
					steeringMode: aizen?.harness.getSteeringMode() ?? session.steeringMode,
					followUpMode: aizen?.harness.getFollowUpMode() ?? session.followUpMode,
					sessionFile: session.sessionFile,
					sessionId: session.sessionId,
					sessionName: session.sessionName,
					autoCompactionEnabled: session.autoCompactionEnabled,
					messageCount: aizen
						? session.sessionManager.buildSessionContext().messages.length
						: session.messages.length,
					pendingMessageCount: aizen?.pendingMessageCount() ?? session.pendingMessageCount,
					readiness: runtimeHost.readiness.snapshot(),
				};
				return success(id, "get_state", state);
			}

			// =================================================================
			// Model
			// =================================================================

			case "set_model": {
				const models = await session.modelRegistry.getAvailable();
				const model = models.find((m) => m.provider === command.provider && m.id === command.modelId);
				if (!model) {
					return error(id, "set_model", `Model not found: ${command.provider}/${command.modelId}`);
				}
				await session.setModel(model);
				runtimeHost.readiness.markReady("model-ready");
				await rebuildAizenRuntime();
				return success(id, "set_model", model);
			}

			case "cycle_model": {
				const result = await session.cycleModel();
				if (!result) {
					return success(id, "cycle_model", null);
				}
				runtimeHost.readiness.markReady("model-ready");
				await rebuildAizenRuntime();
				return success(id, "cycle_model", result);
			}

			case "get_available_models": {
				const models = await session.modelRegistry.getAvailable();
				return success(id, "get_available_models", { models });
			}

			// =================================================================
			// Thinking
			// =================================================================

			case "set_thinking_level": {
				session.setThinkingLevel(command.level);
				await aizen?.harness.setThinkingLevel(command.level);
				return success(id, "set_thinking_level");
			}

			case "cycle_thinking_level": {
				const level = session.cycleThinkingLevel();
				if (!level) {
					return success(id, "cycle_thinking_level", null);
				}
				await aizen?.harness.setThinkingLevel(level);
				return success(id, "cycle_thinking_level", { level });
			}

			// =================================================================
			// Queue Modes
			// =================================================================

			case "set_steering_mode": {
				session.setSteeringMode(command.mode);
				await aizen?.harness.setSteeringMode(command.mode);
				return success(id, "set_steering_mode");
			}

			case "set_follow_up_mode": {
				session.setFollowUpMode(command.mode);
				await aizen?.harness.setFollowUpMode(command.mode);
				return success(id, "set_follow_up_mode");
			}

			// =================================================================
			// Compaction
			// =================================================================

			case "compact": {
				const result = aizen
					? await aizen.compact(command.customInstructions)
					: await session.compact(command.customInstructions);
				return success(id, "compact", result);
			}

			case "set_auto_compaction": {
				session.setAutoCompactionEnabled(command.enabled);
				await rebuildAizenRuntime();
				return success(id, "set_auto_compaction");
			}

			// =================================================================
			// Retry
			// =================================================================

			case "set_auto_retry": {
				session.setAutoRetryEnabled(command.enabled);
				await rebuildAizenRuntime();
				return success(id, "set_auto_retry");
			}

			case "abort_retry": {
				if (aizen) aizen.abortRetry();
				else session.abortRetry();
				return success(id, "abort_retry");
			}

			// =================================================================
			// Bash
			// =================================================================

			case "bash": {
				const result = await session.executeBash(command.command, undefined, {
					excludeFromContext: command.excludeFromContext,
				});
				return success(id, "bash", result);
			}

			case "abort_bash": {
				session.abortBash();
				return success(id, "abort_bash");
			}

			// =================================================================
			// Session
			// =================================================================

			case "get_session_stats": {
				const stats = session.getSessionStats();
				return success(id, "get_session_stats", stats);
			}

			case "export_html": {
				const path = await session.exportToHtml(command.outputPath);
				return success(id, "export_html", { path });
			}

			case "switch_session": {
				assertAizenSessionIdle();
				const result = await runtimeHost.switchSession(command.sessionPath);
				return success(id, "switch_session", result);
			}

			case "fork": {
				assertAizenSessionIdle();
				const result = await runtimeHost.fork(command.entryId);
				return success(id, "fork", { text: result.selectedText, cancelled: result.cancelled });
			}

			case "clone": {
				assertAizenSessionIdle();
				const leafId = session.sessionManager.getLeafId();
				if (!leafId) {
					return error(id, "clone", "Cannot clone session: no current entry selected");
				}
				const result = await runtimeHost.fork(leafId, { position: "at" });
				return success(id, "clone", { cancelled: result.cancelled });
			}

			case "get_fork_messages": {
				const messages = session.getUserMessagesForForking();
				return success(id, "get_fork_messages", { messages });
			}

			case "get_entries": {
				const sessionManager = session.sessionManager;
				let entries = sessionManager.getEntries();
				if (command.since !== undefined) {
					const sinceIndex = entries.findIndex((e) => e.id === command.since);
					if (sinceIndex === -1) {
						return error(id, "get_entries", `Entry not found: ${command.since}`);
					}
					entries = entries.slice(sinceIndex + 1);
				}
				return success(id, "get_entries", { entries, leafId: sessionManager.getLeafId() });
			}

			case "get_tree": {
				const sessionManager = session.sessionManager;
				return success(id, "get_tree", { tree: sessionManager.getTree(), leafId: sessionManager.getLeafId() });
			}

			case "get_last_assistant_text": {
				const text = aizen
					? ([...session.sessionManager.buildSessionContext().messages]
							.reverse()
							.find((message) => message.role === "assistant")
							?.content.filter((content) => content.type === "text")
							.map((content) => content.text)
							.join("\n") ?? null)
					: session.getLastAssistantText();
				return success(id, "get_last_assistant_text", { text });
			}

			case "set_session_name": {
				const name = command.name.trim();
				if (!name) {
					return error(id, "set_session_name", "Session name cannot be empty");
				}
				session.setSessionName(name);
				return success(id, "set_session_name");
			}

			// =================================================================
			// Messages
			// =================================================================

			case "get_messages": {
				return success(id, "get_messages", {
					messages: aizen ? session.sessionManager.buildSessionContext().messages : session.messages,
				});
			}

			// =================================================================
			// Commands (available for invocation via prompt)
			// =================================================================

			case "get_commands": {
				const commands: RpcSlashCommand[] = [];

				for (const command of session.extensionRunner.getRegisteredCommands()) {
					commands.push({
						name: command.invocationName,
						description: command.description,
						source: "extension",
						sourceInfo: command.sourceInfo,
					});
				}

				for (const template of session.promptTemplates) {
					commands.push({
						name: template.name,
						description: template.description,
						source: "prompt",
						sourceInfo: template.sourceInfo,
					});
				}

				for (const skill of session.resourceLoader.getSkills().skills) {
					commands.push({
						name: `skill:${skill.name}`,
						description: skill.description,
						source: "skill",
						sourceInfo: skill.sourceInfo,
					});
				}

				return success(id, "get_commands", { commands });
			}

			default: {
				const unknownCommand = command as { type: string };
				return error(id, unknownCommand.type, `Unknown command: ${unknownCommand.type}`);
			}
		}
	};

	/**
	 * Check if shutdown was requested and perform shutdown if so.
	 * Called after handling each command when waiting for the next command.
	 */
	let detachInput = () => {};

	async function shutdown(exitCode = 0, signal?: NodeJS.Signals): Promise<never> {
		if (shuttingDown) {
			process.exit(exitCode);
		}
		shuttingDown = true;
		for (const cleanup of signalCleanupHandlers) {
			cleanup();
		}
		unsubscribe?.();
		unsubscribeAizen?.();
		unsubscribeBackpressure?.();
		aizen?.abortRetry();
		await aizen?.harness.abort();
		await runtimeHost.dispose();
		detachInput();
		process.stdin.pause();
		if (signal !== "SIGTERM") {
			await flushRawStdout();
		}
		process.exit(exitCode);
	}

	async function checkShutdownRequested(): Promise<void> {
		if (!shutdownRequested) return;
		await shutdown();
	}

	const handleInputLine = async (line: string) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch (parseError: unknown) {
			output(
				error(
					undefined,
					"parse",
					`Failed to parse command: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
				),
			);
			await waitForRawStdoutBackpressure();
			return;
		}

		// Handle extension UI responses
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"type" in parsed &&
			parsed.type === "extension_ui_response"
		) {
			const response = parsed as RpcExtensionUIResponse;
			const pending = pendingExtensionRequests.get(response.id);
			if (pending) {
				pendingExtensionRequests.delete(response.id);
				pending.resolve(response);
			}
			return;
		}

		const command = parsed as RpcCommand;
		try {
			const response = await handleCommand(command);
			if (response) {
				output(response);
				await waitForRawStdoutBackpressure();
			}
			await checkShutdownRequested();
		} catch (commandError: unknown) {
			output(
				error(
					command.id,
					command.type,
					commandError instanceof Error ? commandError.message : String(commandError),
				),
			);
			await waitForRawStdoutBackpressure();
		}
	};

	const onInputEnd = () => {
		void shutdown();
	};
	process.stdin.on("end", onInputEnd);

	detachInput = (() => {
		const detachJsonl = attachJsonlLineReader(process.stdin, (line) => {
			void handleInputLine(line);
		});
		return () => {
			detachJsonl();
			process.stdin.off("end", onInputEnd);
		};
	})();

	// Keep process alive forever
	return new Promise(() => {});
}
