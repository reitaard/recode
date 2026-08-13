import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { AgentTool, ThinkingLevel } from "@reitaard/recode-agent-core";
import type { Model, Models } from "@reitaard/recode-ai";
import { spawnProcessSync } from "../../utils/child-process.ts";
import type { ModelRegistry } from "../model-registry.ts";
import {
	formatNamedWorkerIdentity,
	getNamedWorkerReferences,
	type NamedWorkerDefinition,
	type NamedWorkerProgressEvent,
	type NamedWorkerRunResult,
	type NamedWorkerRunStatus,
	type NamedWorkerSkill,
	type NamedWorkerToolName,
	runNamedWorker,
} from "./named-worker.ts";
import {
	formatOrchestrationActor,
	formatOrchestrationActorContext,
	type OrchestrationActorIdentity,
	RECODE_AIZEN_IDENTITY,
} from "./orchestration-identity.ts";

const DEFAULT_MAX_HISTORY_CHARACTERS = 24_000;
const DEFAULT_MAX_CONVERSATIONS = 64;
const DEFAULT_MAX_ACTIVE_CONVERSATIONS = 8;
const DEFAULT_MAX_ACTIVE_CONVERSATIONS_PER_WORKER = 8;

export type WorkerConversationStatus = "running" | "closed" | NamedWorkerRunStatus;

export interface WorkerDescriptor {
	id: string;
	displayName: string;
	aliases?: readonly string[];
	description: string;
	personality?: string;
	skillName?: string;
	tools: readonly string[];
	thinkingLevel: ThinkingLevel;
	maxOutputTokens: number;
	modelPreference?: WorkerModelPreference;
}

export interface WorkerModelPreference {
	provider: string;
	id: string;
}

export interface WorkerRuntimeSettings {
	modelPreference?: WorkerModelPreference;
	thinkingLevel: ThinkingLevel;
	maxOutputTokens: number;
}

export interface WorkerConversationSnapshot {
	conversationId: string;
	runId?: string;
	workerId: string;
	workerName: string;
	workerAliases?: readonly string[];
	speaker: OrchestrationActorIdentity;
	status: WorkerConversationStatus;
	taskSummary: string;
	createdAt: number;
	updatedAt: number;
	elapsedMs: number;
	turnCount: number;
	lastToolName?: string;
	lastOutput?: string;
	error?: string;
	workspace: string;
}

export interface WorkerConversationTurnResult {
	conversation: WorkerConversationSnapshot;
	result: NamedWorkerRunResult;
}

export interface WorkerConversationStartRequest {
	workerReference: string;
	message: string;
	context?: string;
	signal?: AbortSignal;
	speaker?: OrchestrationActorIdentity;
	workspace?: string;
}

export interface WorkerConversationRestoreTurn {
	conversationId: string;
	workerId: string;
	speaker: OrchestrationActorIdentity;
	message: string;
	result: NamedWorkerRunResult;
	createdAt: number;
	updatedAt: number;
	turnCount: number;
}

export interface WorkerDirectoryRuntimeOptions {
	model?: Model<any>;
	getModel?: () => Model<any> | undefined;
	skills?: readonly NamedWorkerSkill[];
	getSkills?: () => readonly NamedWorkerSkill[];
	getExternalTools?: (worker: NamedWorkerDefinition) => readonly AgentTool[];
	models?: Models;
	modelRegistry?: ModelRegistry;
	/** Optional host policy. Omit for no worker time limit. */
	timeoutMs?: number;
	maxResultCharacters?: number;
	onProgress?: (event: NamedWorkerProgressEvent) => void;
	transformResult?: (
		worker: NamedWorkerDefinition,
		speaker: OrchestrationActorIdentity,
		result: NamedWorkerRunResult,
	) => Promise<NamedWorkerRunResult>;
}

export interface WorkerDirectoryOptions extends WorkerDirectoryRuntimeOptions {
	cwd: string;
	workers: readonly NamedWorkerDefinition[];
	maxHistoryCharacters?: number;
	maxConversations?: number;
	maxActiveConversations?: number;
	maxActiveConversationsPerWorker?: number;
}

interface ConversationHistoryEntry {
	role: "speaker" | "worker";
	text: string;
}

interface WorkerConversationRecord {
	conversationId: string;
	worker: NamedWorkerDefinition;
	speaker: OrchestrationActorIdentity;
	status: WorkerConversationStatus;
	taskSummary: string;
	createdAt: number;
	updatedAt: number;
	startedAt?: number;
	finishedAt?: number;
	turnCount: number;
	runId?: string;
	lastToolName?: string;
	lastOutput?: string;
	error?: string;
	history: ConversationHistoryEntry[];
	workspace: string;
	abortController?: AbortController;
}

function normalizeWorkerReference(value: string): string {
	return value.trim().toLowerCase();
}

function summarizeTask(value: string): string {
	const compact = value.replace(/\s+/g, " ").trim();
	return compact.length <= 180 ? compact : `${compact.slice(0, 177)}...`;
}

function statusFromResult(result: NamedWorkerRunResult): WorkerConversationStatus {
	return result.status;
}

function normalizeWorkspacePath(workspace: string): string {
	return process.platform === "win32" && /^\/[a-zA-Z](?:\/|$)/.test(workspace)
		? `${workspace[1]!.toUpperCase()}:${workspace.slice(2)}`
		: workspace;
}

function resolveWorkspacePath(workspace: string): string {
	return realpathSync(resolve(normalizeWorkspacePath(workspace)));
}

/** Resolve an absolute or workspace-relative path reported by Git, including MSYS drive paths. */
export function resolveWorkerGitPath(workspace: string, gitPath: string): string {
	const normalized = normalizeWorkspacePath(gitPath);
	return realpathSync(isAbsolute(normalized) ? normalized : resolve(workspace, normalized));
}

function gitCommonDirectory(workspace: string): string | undefined {
	const result = spawnProcessSync(
		"git",
		["-C", workspace, "rev-parse", "--path-format=absolute", "--git-common-dir"],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	if (result.status !== 0 || !result.stdout.trim()) return undefined;
	return resolveWorkerGitPath(workspace, result.stdout.trim());
}

export class WorkerDirectory {
	private readonly workers: readonly NamedWorkerDefinition[];
	private readonly byReference = new Map<string, NamedWorkerDefinition>();
	private readonly conversations = new Map<string, WorkerConversationRecord>();
	private runtime: WorkerDirectoryRuntimeOptions;
	private readonly cwd: string;
	private readonly maxHistoryCharacters: number;
	private readonly maxConversations: number;
	private readonly maxActiveConversations: number;
	private readonly maxActiveConversationsPerWorker: number;
	private readonly workerSettings = new Map<string, WorkerRuntimeSettings>();
	private readonly oneShotControllers = new Set<AbortController>();
	private readonly activeOneShotsByWorker = new Map<string, number>();

	constructor(options: WorkerDirectoryOptions) {
		if (!options.cwd.trim()) throw new Error("WorkerDirectory cwd is required");
		if (options.workers.length === 0) throw new Error("WorkerDirectory requires at least one worker");
		if (!options.model && !options.getModel) throw new Error("WorkerDirectory requires model or getModel");
		if (!options.models && !options.modelRegistry) {
			throw new Error("WorkerDirectory requires models or modelRegistry");
		}
		this.cwd = options.cwd;
		this.workers = [...options.workers];
		this.runtime = options;
		this.maxHistoryCharacters = options.maxHistoryCharacters ?? DEFAULT_MAX_HISTORY_CHARACTERS;
		this.maxConversations = options.maxConversations ?? DEFAULT_MAX_CONVERSATIONS;
		this.maxActiveConversations = options.maxActiveConversations ?? DEFAULT_MAX_ACTIVE_CONVERSATIONS;
		this.maxActiveConversationsPerWorker =
			options.maxActiveConversationsPerWorker ?? DEFAULT_MAX_ACTIVE_CONVERSATIONS_PER_WORKER;
		if (!Number.isInteger(this.maxActiveConversations) || this.maxActiveConversations <= 0) {
			throw new Error("WorkerDirectory maxActiveConversations must be a positive integer");
		}
		if (!Number.isInteger(this.maxActiveConversationsPerWorker) || this.maxActiveConversationsPerWorker <= 0) {
			throw new Error("WorkerDirectory maxActiveConversationsPerWorker must be a positive integer");
		}
		for (const worker of this.workers) {
			for (const reference of getNamedWorkerReferences(worker)) {
				const key = normalizeWorkerReference(reference);
				const existing = this.byReference.get(key);
				if (existing && existing.id !== worker.id) {
					throw new Error(`Worker reference collision: ${reference} maps to ${existing.id} and ${worker.id}`);
				}
				this.byReference.set(key, worker);
			}
		}
	}

	updateRuntime(options: WorkerDirectoryRuntimeOptions): void {
		this.runtime = { ...this.runtime, ...options };
	}

	getWorkerDefinitions(): readonly NamedWorkerDefinition[] {
		return this.workers;
	}

	listWorkers(): WorkerDescriptor[] {
		return this.workers.map((worker) => {
			const settings = this.getWorkerSettings(worker.id);
			return {
				id: worker.id,
				displayName: worker.displayName,
				aliases: worker.aliases,
				description: worker.description,
				personality: worker.personality,
				skillName: worker.skillName,
				tools: this.effectiveTools(worker).names,
				thinkingLevel: settings.thinkingLevel,
				maxOutputTokens: settings.maxOutputTokens,
				modelPreference: settings.modelPreference,
			};
		});
	}

	getWorkerSettings(workerReference: string): WorkerRuntimeSettings {
		const worker = this.resolveWorker(workerReference);
		return (
			this.workerSettings.get(worker.id) ?? {
				thinkingLevel: worker.thinkingLevel ?? "off",
				maxOutputTokens: worker.maxOutputTokens ?? 4_096,
			}
		);
	}

	setWorkerSettings(workerReference: string, settings: WorkerRuntimeSettings): void {
		const worker = this.resolveWorker(workerReference);
		if (!Number.isInteger(settings.maxOutputTokens) || settings.maxOutputTokens <= 0) {
			throw new Error("Worker token budget must be a positive integer");
		}
		if (
			settings.modelPreference &&
			(!settings.modelPreference.provider.trim() || !settings.modelPreference.id.trim())
		) {
			throw new Error("Worker model preference requires provider and id");
		}
		this.workerSettings.set(worker.id, {
			thinkingLevel: settings.thinkingLevel,
			maxOutputTokens: settings.maxOutputTokens,
			...(settings.modelPreference ? { modelPreference: settings.modelPreference } : {}),
		});
	}

	resolveWorker(reference: string): NamedWorkerDefinition {
		const worker = this.byReference.get(normalizeWorkerReference(reference));
		if (worker) return worker;
		const available = this.workers
			.map((candidate) => `${candidate.id} (${formatNamedWorkerIdentity(candidate)})`)
			.join(", ");
		throw new Error(`Unknown named worker: ${reference}. Available: ${available}`);
	}

	assertCanStartConversations(workerReferences: readonly string[]): void {
		this.assertCanStartWorkerIds(workerReferences.map((reference) => this.resolveWorker(reference).id));
	}

	resolveWorkspace(requestedWorkspace = this.cwd): string {
		const activeWorkspace = resolveWorkspacePath(this.cwd);
		const requested = resolveWorkspacePath(requestedWorkspace);
		if (requested === activeWorkspace) return requested;
		const activeCommonDirectory = gitCommonDirectory(activeWorkspace);
		const requestedCommonDirectory = gitCommonDirectory(requested);
		if (!activeCommonDirectory || requestedCommonDirectory !== activeCommonDirectory) {
			throw new Error(
				"Worker workspace must be the active workspace or another worktree of the same Git repository",
			);
		}
		return requested;
	}

	async runOneShot(
		workerReference: string,
		task: string,
		context?: string,
		signal?: AbortSignal,
		speaker: OrchestrationActorIdentity = RECODE_AIZEN_IDENTITY,
		workspace = this.cwd,
	): Promise<NamedWorkerRunResult> {
		if (!task.trim()) throw new Error("Worker task is required");
		const worker = this.resolveWorker(workerReference);
		const resolvedWorkspace = this.resolveWorkspace(workspace);
		this.assertCanStartWorkerIds([worker.id]);
		const controller = new AbortController();
		const onAbort = () => controller.abort();
		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) controller.abort();
		this.oneShotControllers.add(controller);
		this.activeOneShotsByWorker.set(worker.id, (this.activeOneShotsByWorker.get(worker.id) ?? 0) + 1);
		const actorContext = [formatOrchestrationActorContext(speaker), context?.trim()].filter(Boolean).join("\n\n");
		try {
			return await this.run(
				worker,
				resolvedWorkspace,
				task,
				actorContext,
				controller.signal,
				this.runtime.onProgress,
			);
		} finally {
			this.oneShotControllers.delete(controller);
			const remaining = (this.activeOneShotsByWorker.get(worker.id) ?? 1) - 1;
			if (remaining > 0) this.activeOneShotsByWorker.set(worker.id, remaining);
			else this.activeOneShotsByWorker.delete(worker.id);
			signal?.removeEventListener("abort", onAbort);
		}
	}

	async startConversation(
		workerReference: string,
		message: string,
		context?: string,
		signal?: AbortSignal,
		speaker: OrchestrationActorIdentity = RECODE_AIZEN_IDENTITY,
		workspace = this.cwd,
	): Promise<WorkerConversationTurnResult> {
		const [turn] = await this.startConversations([{ workerReference, message, context, signal, speaker, workspace }]);
		return turn!;
	}

	async startConversations(
		requests: readonly WorkerConversationStartRequest[],
	): Promise<WorkerConversationTurnResult[]> {
		if (requests.length === 0) throw new Error("At least one worker conversation is required");
		const prepared = requests.map((request) => {
			if (!request.message.trim()) throw new Error("Worker message is required");
			return {
				...request,
				worker: this.resolveWorker(request.workerReference),
				workspace: this.resolveWorkspace(request.workspace ?? this.cwd),
			};
		});
		this.assertCanStartWorkerIds(prepared.map((request) => request.worker.id));
		this.ensureConversationSlots(prepared.length);

		const records = prepared.map((request) => {
			const now = Date.now();
			const record: WorkerConversationRecord = {
				conversationId: randomUUID(),
				worker: request.worker,
				speaker: request.speaker ?? RECODE_AIZEN_IDENTITY,
				status: "completed",
				taskSummary: summarizeTask(request.message),
				createdAt: now,
				updatedAt: now,
				turnCount: 0,
				history: [],
				workspace: request.workspace,
			};
			this.conversations.set(record.conversationId, record);
			return { request, record };
		});
		return Promise.all(
			records.map(async ({ request, record }) => {
				const result = await this.executeConversationTurn(record, request.message, request.context, request.signal);
				return { conversation: this.snapshot(record), result };
			}),
		);
	}

	async messageConversation(
		conversationId: string,
		message: string,
		context?: string,
		signal?: AbortSignal,
	): Promise<WorkerConversationTurnResult> {
		const record = this.requireConversation(conversationId);
		if (record.status === "closed") throw new Error(`Worker conversation is closed: ${conversationId}`);
		this.assertConversationCapacity(record.worker.id);
		const result = await this.executeConversationTurn(record, message, context, signal);
		return { conversation: this.snapshot(record), result };
	}

	restoreConversationTurn(turn: WorkerConversationRestoreTurn): WorkerConversationSnapshot {
		if (!turn.conversationId.trim()) throw new Error("Restored worker conversation id is required");
		if (!turn.message.trim()) throw new Error("Restored worker conversation message is required");
		if (!Number.isInteger(turn.turnCount) || turn.turnCount <= 0) {
			throw new Error("Restored worker conversation turn count must be a positive integer");
		}
		const worker = this.resolveWorker(turn.workerId);
		let record = this.conversations.get(turn.conversationId);
		if (!record) {
			record = {
				conversationId: turn.conversationId,
				worker,
				speaker: turn.speaker,
				status: turn.result.status,
				taskSummary: summarizeTask(turn.message),
				createdAt: turn.createdAt,
				updatedAt: turn.updatedAt,
				turnCount: 0,
				history: [],
				workspace: this.resolveWorkspace(),
			};
			this.conversations.set(record.conversationId, record);
		} else if (record.worker.id !== worker.id || record.speaker.id !== turn.speaker.id) {
			throw new Error(`Restored worker conversation identity mismatch: ${turn.conversationId}`);
		}
		if (turn.turnCount <= record.turnCount) return this.snapshot(record);

		record.runId = turn.result.runId;
		record.status = turn.result.status;
		record.taskSummary = summarizeTask(turn.message);
		record.createdAt = Math.min(record.createdAt, turn.createdAt);
		record.startedAt = Math.max(turn.createdAt, turn.updatedAt - turn.result.durationMs);
		record.finishedAt = turn.updatedAt;
		record.updatedAt = turn.updatedAt;
		record.turnCount = turn.turnCount;
		record.lastOutput = turn.result.output || undefined;
		record.error = turn.result.error;
		record.history.push({ role: "speaker", text: turn.message.trim() });
		record.history.push({
			role: "worker",
			text: turn.result.output || turn.result.error || `[${turn.result.status}]`,
		});
		this.trimHistory(record);
		this.pruneConversations();
		return this.snapshot(record);
	}

	getStatus(conversationId?: string): WorkerConversationSnapshot[] {
		if (conversationId) return [this.snapshot(this.requireConversation(conversationId))];
		return [...this.conversations.values()]
			.sort((left, right) => right.updatedAt - left.updatedAt)
			.map((record) => this.snapshot(record));
	}

	cancelConversation(conversationId: string): boolean {
		const record = this.requireConversation(conversationId);
		if (record.status !== "running" || !record.abortController) return false;
		record.abortController.abort();
		return true;
	}

	closeConversation(conversationId: string): WorkerConversationSnapshot {
		const record = this.requireConversation(conversationId);
		record.abortController?.abort();
		record.status = "closed";
		record.updatedAt = Date.now();
		const snapshot = this.snapshot(record);
		this.conversations.delete(conversationId);
		return snapshot;
	}

	closeAll(): void {
		for (const controller of this.oneShotControllers) controller.abort();
		for (const record of this.conversations.values()) record.abortController?.abort();
		this.conversations.clear();
	}

	private async executeConversationTurn(
		record: WorkerConversationRecord,
		message: string,
		context?: string,
		signal?: AbortSignal,
	): Promise<NamedWorkerRunResult> {
		if (!message.trim()) throw new Error("Worker message is required");
		if (record.status === "running")
			throw new Error(`Worker conversation is already running: ${record.conversationId}`);

		const controller = new AbortController();
		const onAbort = () => controller.abort();
		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) controller.abort();

		record.abortController = controller;
		record.status = "running";
		record.taskSummary = summarizeTask(message);
		record.startedAt = Date.now();
		record.finishedAt = undefined;
		record.updatedAt = record.startedAt;
		record.lastToolName = undefined;
		record.error = undefined;

		const conversationContext = this.buildConversationContext(record, context);
		try {
			let result = await this.run(
				record.worker,
				record.workspace,
				message,
				conversationContext,
				controller.signal,
				(event) => {
					if (event.type === "start") record.runId = event.runId;
					if (event.type === "tool_start") record.lastToolName = event.toolName;
					record.updatedAt = Date.now();
					this.runtime.onProgress?.(event);
				},
			);
			if (this.runtime.transformResult) {
				result = await this.runtime.transformResult(record.worker, record.speaker, result);
			}
			this.recordResult(record, message, result);
			return result;
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const result: NamedWorkerRunResult = {
				runId: record.runId ?? randomUUID(),
				workerId: record.worker.id,
				workerName: record.worker.displayName,
				workerAliases: record.worker.aliases,
				status: "failed",
				output: "",
				error: errorMessage,
				harnessSetupDurationMs: 0,
				durationMs: record.startedAt ? Date.now() - record.startedAt : 0,
				truncated: false,
			};
			this.recordResult(record, message, result);
			return result;
		} finally {
			record.abortController = undefined;
			signal?.removeEventListener("abort", onAbort);
		}
	}

	private recordResult(record: WorkerConversationRecord, message: string, result: NamedWorkerRunResult): void {
		record.runId = result.runId;
		record.status = statusFromResult(result);
		record.finishedAt = Date.now();
		record.updatedAt = record.finishedAt;
		record.turnCount += 1;
		record.lastOutput = result.output || undefined;
		record.error = result.error;
		record.history.push({ role: "speaker", text: message.trim() });
		record.history.push({
			role: "worker",
			text: result.output || result.error || `[${result.status}]`,
		});
		this.trimHistory(record);
	}

	private async run(
		worker: NamedWorkerDefinition,
		workspace: string,
		task: string,
		context: string | undefined,
		signal: AbortSignal | undefined,
		onProgress: ((event: NamedWorkerProgressEvent) => void) | undefined,
	): Promise<NamedWorkerRunResult> {
		const settings = this.getWorkerSettings(worker.id);
		const preferredModel = settings.modelPreference
			? this.runtime.modelRegistry?.find(settings.modelPreference.provider, settings.modelPreference.id)
			: undefined;
		const model = preferredModel ?? this.runtime.getModel?.() ?? this.runtime.model;
		if (!model) throw new Error("Cannot run worker without an active model");
		const effectiveTools = this.effectiveTools(worker);
		return runNamedWorker({
			cwd: workspace,
			worker: {
				...worker,
				tools: effectiveTools.names,
				thinkingLevel: settings.thinkingLevel,
				maxOutputTokens: settings.maxOutputTokens,
			},
			model,
			skills: this.runtime.getSkills?.() ?? this.runtime.skills,
			models: this.runtime.models,
			modelRegistry: this.runtime.modelRegistry,
			externalTools: effectiveTools.external,
			task,
			context,
			timeoutMs: this.runtime.timeoutMs,
			maxResultCharacters: this.runtime.maxResultCharacters,
			signal,
			onProgress,
		});
	}

	private effectiveTools(worker: NamedWorkerDefinition): {
		names: readonly NamedWorkerToolName[];
		external: readonly AgentTool[];
	} {
		const external = this.runtime.getExternalTools?.(worker) ?? [];
		const names = [
			...new Set([...(worker.tools ?? ["read", "grep", "find", "ls"]), ...external.map((tool) => tool.name)]),
		] as NamedWorkerToolName[];
		return { names, external };
	}

	private buildConversationContext(record: WorkerConversationRecord, hostContext?: string): string | undefined {
		const speakerName = formatOrchestrationActor(record.speaker);
		const sections = [formatOrchestrationActorContext(record.speaker)];
		if (hostContext?.trim())
			sections.push(`CURRENT ${record.speaker.role.toUpperCase()} CONTEXT\n${hostContext.trim()}`);
		if (record.history.length > 0) {
			const transcript = record.history
				.map((entry) => `${entry.role === "speaker" ? speakerName : record.worker.displayName}: ${entry.text}`)
				.join("\n\n");
			sections.push(`PERSISTENT WORKER CONVERSATION\n${transcript}`);
		}
		return sections.length > 0 ? sections.join("\n\n") : undefined;
	}

	private trimHistory(record: WorkerConversationRecord): void {
		let size = record.history.reduce((sum, entry) => sum + entry.text.length, 0);
		while (size > this.maxHistoryCharacters && record.history.length > 2) {
			const removed = record.history.shift();
			if (removed) size -= removed.text.length;
		}
	}

	private snapshot(record: WorkerConversationRecord): WorkerConversationSnapshot {
		const end = record.finishedAt ?? Date.now();
		return {
			conversationId: record.conversationId,
			runId: record.runId,
			workerId: record.worker.id,
			workerName: record.worker.displayName,
			workerAliases: record.worker.aliases,
			speaker: record.speaker,
			status: record.status,
			taskSummary: record.taskSummary,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
			elapsedMs: record.startedAt ? Math.max(0, end - record.startedAt) : 0,
			turnCount: record.turnCount,
			lastToolName: record.lastToolName,
			lastOutput: record.lastOutput,
			error: record.error,
			workspace: record.workspace,
		};
	}

	private assertConversationCapacity(workerId: string): void {
		this.assertCanStartWorkerIds([workerId]);
	}

	private assertCanStartWorkerIds(requestedWorkerIds: readonly string[]): void {
		const running = [...this.conversations.values()].filter((record) => record.status === "running");
		const activeOneShots = [...this.activeOneShotsByWorker.values()].reduce((sum, count) => sum + count, 0);
		if (running.length + activeOneShots + requestedWorkerIds.length > this.maxActiveConversations) {
			throw new Error(`Worker conversation concurrency limit reached (${this.maxActiveConversations})`);
		}
		for (const workerId of new Set(requestedWorkerIds)) {
			const runningForWorker = running.filter((record) => record.worker.id === workerId).length;
			const activeOneShotsForWorker = this.activeOneShotsByWorker.get(workerId) ?? 0;
			const requestedForWorker = requestedWorkerIds.filter((candidate) => candidate === workerId).length;
			if (runningForWorker + activeOneShotsForWorker + requestedForWorker > this.maxActiveConversationsPerWorker) {
				throw new Error(
					`Worker concurrency limit reached for ${workerId} (${this.maxActiveConversationsPerWorker})`,
				);
			}
		}
	}

	private ensureConversationSlots(requiredSlots: number): void {
		if (requiredSlots > this.maxConversations) {
			throw new Error("Worker conversation limit reached; close an existing conversation first");
		}
		const removable = [...this.conversations.values()]
			.filter((record) => record.status !== "running")
			.sort((left, right) => left.updatedAt - right.updatedAt);
		while (this.conversations.size + requiredSlots > this.maxConversations && removable.length > 0) {
			const record = removable.shift();
			if (record) this.conversations.delete(record.conversationId);
		}
		if (this.conversations.size + requiredSlots > this.maxConversations) {
			throw new Error("Worker conversation limit reached; close an existing conversation first");
		}
	}

	private requireConversation(conversationId: string): WorkerConversationRecord {
		const record = this.conversations.get(conversationId);
		if (!record) throw new Error(`Unknown worker conversation: ${conversationId}`);
		return record;
	}

	private pruneConversations(): void {
		if (this.conversations.size < this.maxConversations) return;
		const removable = [...this.conversations.values()]
			.filter((record) => record.status !== "running")
			.sort((left, right) => left.updatedAt - right.updatedAt);
		while (this.conversations.size >= this.maxConversations && removable.length > 0) {
			const record = removable.shift();
			if (record) this.conversations.delete(record.conversationId);
		}
		if (this.conversations.size >= this.maxConversations) {
			throw new Error("Worker conversation limit reached; close an existing conversation first");
		}
	}
}
