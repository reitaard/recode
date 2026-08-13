import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
	isLegalMaestroTransition,
	isMaestroTerminalState,
	MAESTRO_LIFECYCLE_CONTRACT_VERSION,
	type MaestroAttachment,
	type MaestroCancelResult,
	type MaestroDetachResult,
	type MaestroHandle,
	type MaestroLaunchRequest,
	MaestroLifecycleError,
	type MaestroLifecycleEvent,
	type MaestroLifecycleKind,
	type MaestroLifecycleState,
	type MaestroProgressSnapshot,
	type MaestroReconnectResult,
	type MaestroResult,
	type MaestroRuntimeIdentity,
	type MaestroStatus,
	type MaestroTerminalState,
	type MaestroTerminalStatus,
} from "./lifecycle-contract.ts";
import type { CompletionRecord } from "./types.ts";

const MAX_GOAL_CHARS = 16_000;
const MAX_CONTEXT_CHARS = 32_000;
const MAX_METADATA_BYTES = 8_192;
const MAX_RESULT_CHARS = 32_000;
const MAX_PROGRESS_CHARS = 4_096;
const DEFAULT_TERMINAL_RETENTION_MS = 60 * 60 * 1_000;

export interface MaestroLifecycleCompletion {
	state: MaestroTerminalState;
	summary?: string;
	errorClassification?: string;
	errorMessage?: string;
	resultHash?: string;
	handoffState?: "not-required" | "queued" | "failed";
	handoffDiagnostic?: string;
}

export interface MaestroLifecycleControl {
	readonly handle: Readonly<MaestroHandle>;
	transition(
		state: "RUNNING" | "WAITING_INPUT",
		updates?: { runtime?: MaestroRuntimeIdentity; progress?: MaestroProgressSnapshot },
	): void;
	update(updates: { runtime?: MaestroRuntimeIdentity; progress?: MaestroProgressSnapshot }): void;
}

export interface MaestroLifecycleAdapter {
	readonly kind: MaestroLifecycleKind;
	launch(
		request: Readonly<MaestroLaunchRequest>,
		control: MaestroLifecycleControl,
	): Promise<MaestroLifecycleCompletion>;
	cancel?(handle: Readonly<MaestroHandle>, reason: string, commandId?: string): Promise<boolean>;
	stop?(handle: Readonly<MaestroHandle>): Promise<void>;
	reconnect?(handle: Readonly<MaestroHandle>, status: Readonly<MaestroStatus>): Promise<MaestroReconnectResult>;
}

interface LifecycleRecord {
	handle: MaestroHandle;
	request: Readonly<MaestroLaunchRequest>;
	adapter: MaestroLifecycleAdapter;
	state: Exclude<MaestroLifecycleState, "UNKNOWN">;
	updatedAt: string;
	startedAt?: string;
	completedAt?: string;
	ownerGeneration: number;
	owner?: MaestroAttachment;
	runtime: MaestroRuntimeIdentity;
	progress?: MaestroProgressSnapshot;
	result?: MaestroResult;
	completion: Promise<void>;
	resolveCompletion: () => void;
	subscribers: Set<(event: Readonly<MaestroLifecycleEvent>) => void>;
}

export interface MaestroCompletionSink {
	enqueue(input: {
		parentInstanceId?: string;
		parentSessionId?: string;
		childInstanceId: string;
		childSessionId?: string;
		terminalState: MaestroTerminalState;
		summary?: string;
		resultHash: string;
		completedAt: string;
	}): CompletionRecord;
}

export interface MaestroLifecycleServiceOptions {
	adapters: readonly MaestroLifecycleAdapter[];
	terminalRetentionMs?: number;
	now?: () => Date;
	completionQueue?: MaestroCompletionSink;
}

function bounded(value: string | undefined, max: number): string | undefined {
	return value === undefined ? undefined : value.slice(0, max);
}

function cloneHandle(handle: MaestroHandle): MaestroHandle {
	return { ...handle };
}

function cloneRuntime(runtime: MaestroRuntimeIdentity): MaestroRuntimeIdentity {
	return { ...runtime, process: runtime.process ? { ...runtime.process } : undefined };
}

function normalizeRuntime(runtime: MaestroRuntimeIdentity, kind: MaestroLifecycleKind): MaestroRuntimeIdentity {
	if (typeof runtime.cwd !== "string" || !runtime.cwd || runtime.cwd.length > 4096) {
		throw new MaestroLifecycleError("INVALID_REQUEST", "Adapter runtime cwd must contain 1 to 4096 characters");
	}
	for (const [name, value, max] of [
		["worktreeIdentity", runtime.worktreeIdentity, 512],
		["sessionId", runtime.sessionId, 512],
		["sessionFile", runtime.sessionFile, 4096],
	] as const) {
		if (value !== undefined && (typeof value !== "string" || !value || value.length > max)) {
			throw new MaestroLifecycleError(
				"INVALID_REQUEST",
				`Adapter runtime ${name} must contain 1 to ${max} characters`,
			);
		}
	}
	if (kind === "full-session" && (!runtime.process || !runtime.sessionId)) {
		throw new MaestroLifecycleError(
			"INVALID_REQUEST",
			"Full-session runtime identity requires process and session IDs",
		);
	}
	if (
		runtime.process &&
		(!Number.isSafeInteger(runtime.process.pid) ||
			runtime.process.pid <= 0 ||
			typeof runtime.process.startReceipt !== "string" ||
			!runtime.process.startReceipt ||
			runtime.process.startReceipt.length > 1024)
	) {
		throw new MaestroLifecycleError("INVALID_REQUEST", "Adapter process identity is malformed or unbounded");
	}
	return cloneRuntime(runtime);
}

function cloneProgress(progress: MaestroProgressSnapshot | undefined): MaestroProgressSnapshot | undefined {
	return progress ? { ...progress } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasValidHandleShape(value: unknown): value is MaestroHandle {
	if (!isRecord(value)) return false;
	return (
		value.contractVersion === MAESTRO_LIFECYCLE_CONTRACT_VERSION &&
		typeof value.instanceId === "string" &&
		value.instanceId.length > 0 &&
		(value.kind === "worker" || value.kind === "full-session") &&
		(value.parentInstanceId === undefined || typeof value.parentInstanceId === "string") &&
		(value.parentSessionId === undefined || typeof value.parentSessionId === "string") &&
		(value.correlationId === undefined || typeof value.correlationId === "string") &&
		typeof value.createdAt === "string" &&
		Number.isFinite(Date.parse(value.createdAt)) &&
		typeof value.capability === "string" &&
		value.capability.length >= 32
	);
}

function capabilitiesEqual(left: string, right: string): boolean {
	const leftBytes = Buffer.from(left);
	const rightBytes = Buffer.from(right);
	return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function normalizeCompletionState(
	current: Exclude<MaestroLifecycleState, "UNKNOWN">,
	completed: MaestroTerminalState,
): MaestroTerminalState {
	return current === "CANCEL_REQUESTED" && completed === "INTERRUPTED" ? "CANCELLED" : completed;
}

function validateLaunchRequest(request: MaestroLaunchRequest): void {
	if (!request || typeof request !== "object") {
		throw new MaestroLifecycleError("INVALID_REQUEST", "Launch request must be an object");
	}
	if (request.kind !== "worker" && request.kind !== "full-session") {
		throw new MaestroLifecycleError("INVALID_REQUEST", "Launch kind must be worker or full-session");
	}
	if (typeof request.goal !== "string" || !request.goal.trim() || request.goal.length > MAX_GOAL_CHARS) {
		throw new MaestroLifecycleError("INVALID_REQUEST", "goal must contain 1 to 16000 characters");
	}
	if (
		request.context !== undefined &&
		(typeof request.context !== "string" || request.context.length > MAX_CONTEXT_CHARS)
	) {
		throw new MaestroLifecycleError("INVALID_REQUEST", "context must contain at most 32000 characters");
	}
	if (typeof request.role !== "string" || !request.role.trim() || request.role.length > 128) {
		throw new MaestroLifecycleError("INVALID_REQUEST", "role must contain 1 to 128 characters");
	}
	if (typeof request.cwd !== "string" || !request.cwd || request.cwd.length > 4096) {
		throw new MaestroLifecycleError("INVALID_REQUEST", "cwd must contain 1 to 4096 characters");
	}
	if (request.workspaceAccess !== "read-only" && request.workspaceAccess !== "write") {
		throw new MaestroLifecycleError("INVALID_REQUEST", "workspaceAccess must be read-only or write");
	}
	if (request.kind === "worker" && request.workspaceAccess !== "read-only") {
		throw new MaestroLifecycleError("INVALID_REQUEST", "Named-worker lifecycle requests must remain read-only");
	}
	for (const value of [request.parentInstanceId, request.parentSessionId, request.correlationId]) {
		if (value !== undefined && (typeof value !== "string" || !value || value.length > 512)) {
			throw new MaestroLifecycleError(
				"INVALID_REQUEST",
				"Optional identity fields must contain 1 to 512 characters",
			);
		}
	}
	try {
		const serialized = JSON.stringify(request.metadata ?? {});
		if (serialized === undefined || Buffer.byteLength(serialized) > MAX_METADATA_BYTES) {
			throw new MaestroLifecycleError("INVALID_REQUEST", "metadata exceeds 8192 bytes");
		}
	} catch (error) {
		if (error instanceof MaestroLifecycleError) throw error;
		throw new MaestroLifecycleError("INVALID_REQUEST", "metadata must be JSON-serializable");
	}
}

export class MaestroLifecycleService {
	private readonly adapters: ReadonlyMap<MaestroLifecycleKind, MaestroLifecycleAdapter>;
	private readonly records = new Map<string, LifecycleRecord>();
	private readonly correlations = new Map<string, string>();
	private readonly terminalRetentionMs: number;
	private readonly now: () => Date;
	private readonly completionQueue?: MaestroCompletionSink;

	constructor(options: MaestroLifecycleServiceOptions) {
		const adapters = new Map<MaestroLifecycleKind, MaestroLifecycleAdapter>();
		for (const adapter of options.adapters) {
			if (adapters.has(adapter.kind)) {
				throw new MaestroLifecycleError("INVALID_REQUEST", `Duplicate lifecycle adapter: ${adapter.kind}`);
			}
			adapters.set(adapter.kind, adapter);
		}
		this.adapters = adapters;
		this.terminalRetentionMs = options.terminalRetentionMs ?? DEFAULT_TERMINAL_RETENTION_MS;
		if (!Number.isFinite(this.terminalRetentionMs) || this.terminalRetentionMs < 0) {
			throw new MaestroLifecycleError("INVALID_REQUEST", "terminalRetentionMs must be a non-negative finite number");
		}
		this.now = options.now ?? (() => new Date());
		this.completionQueue = options.completionQueue;
	}

	launch(request: MaestroLaunchRequest, options: { instanceId?: string } = {}): Readonly<MaestroHandle> {
		validateLaunchRequest(request);
		if (
			options.instanceId !== undefined &&
			(typeof options.instanceId !== "string" || !options.instanceId || options.instanceId.length > 512)
		) {
			throw new MaestroLifecycleError("INVALID_REQUEST", "instanceId must contain 1 to 512 characters");
		}
		this.cleanupExpired();
		const adapter = this.adapters.get(request.kind);
		if (!adapter) {
			throw new MaestroLifecycleError("INVALID_REQUEST", `No lifecycle adapter registered for ${request.kind}`);
		}
		const correlationKey = this.correlationKey(request);
		if (request.correlationId && this.correlations.has(correlationKey)) {
			throw new MaestroLifecycleError("DUPLICATE_CORRELATION", "Duplicate correlationId for this parent");
		}
		const createdAt = this.timestamp();
		const instanceId = options.instanceId ?? randomUUID();
		if (this.records.has(instanceId)) {
			throw new MaestroLifecycleError("INVALID_REQUEST", `Lifecycle instance already exists: ${instanceId}`);
		}
		const handle: MaestroHandle = {
			contractVersion: MAESTRO_LIFECYCLE_CONTRACT_VERSION,
			instanceId,
			kind: request.kind,
			parentInstanceId: request.parentInstanceId,
			parentSessionId: request.parentSessionId,
			correlationId: request.correlationId,
			createdAt,
			capability: randomBytes(32).toString("base64url"),
		};
		let resolveCompletion = (): void => undefined;
		const completion = new Promise<void>((resolve) => {
			resolveCompletion = resolve;
		});
		const record: LifecycleRecord = {
			handle,
			request: { ...request, metadata: request.metadata ? { ...request.metadata } : undefined },
			adapter,
			state: "PENDING",
			updatedAt: createdAt,
			ownerGeneration: 0,
			runtime: {
				cwd: request.cwd,
			},
			completion,
			resolveCompletion,
			subscribers: new Set(),
		};
		this.records.set(handle.instanceId, record);
		if (request.correlationId) this.correlations.set(correlationKey, handle.instanceId);
		queueMicrotask(() => void this.runLaunch(record));
		return cloneHandle(handle);
	}

	status(handle: MaestroHandle): MaestroStatus {
		this.cleanupExpired();
		const record = this.findRecord(handle);
		if (!record) {
			return {
				handle: hasValidHandleShape(handle) ? cloneHandle(handle) : this.unknownHandle(),
				state: "UNKNOWN",
				updatedAt: this.timestamp(),
				ownerGeneration: 0,
				runtime: { cwd: "" },
				diagnostic: "UNKNOWN_HANDLE",
			};
		}
		return this.snapshot(record);
	}

	setWaitingInput(handle: MaestroHandle, waiting: boolean): MaestroStatus {
		const record = this.requireRecord(handle);
		if (
			isMaestroTerminalState(record.state) ||
			record.state === "CANCEL_REQUESTED" ||
			record.state === "PENDING" ||
			record.state === "STARTING"
		)
			return this.snapshot(record);
		const target = waiting ? "WAITING_INPUT" : "RUNNING";
		if (record.state !== target) this.transition(record, target);
		return this.snapshot(record);
	}

	async wait(handle: MaestroHandle, timeoutMs?: number): Promise<MaestroTerminalStatus> {
		const record = this.findRecord(handle);
		if (!record) return this.terminalStatus(handle, "UNKNOWN", true, false, "UNKNOWN_HANDLE");
		if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
			throw new MaestroLifecycleError("INVALID_REQUEST", "timeoutMs must be a non-negative finite number");
		}
		if (!isMaestroTerminalState(record.state)) {
			const completed = await this.waitForCompletion(record.completion, timeoutMs);
			if (!completed) return this.terminalStatus(record.handle, record.state, false, true);
		}
		return this.terminalStatus(record.handle, record.state, isMaestroTerminalState(record.state), false);
	}

	async cancel(handle: MaestroHandle, reason: string, commandId?: string): Promise<MaestroCancelResult> {
		const record = this.findRecord(handle);
		if (!record) {
			return {
				accepted: false,
				alreadyTerminal: false,
				unknownHandle: true,
				unsupported: false,
				staleOwner: false,
				state: "UNKNOWN",
			};
		}
		if (isMaestroTerminalState(record.state)) {
			return {
				accepted: false,
				alreadyTerminal: true,
				unknownHandle: false,
				unsupported: false,
				staleOwner: false,
				state: record.state,
			};
		}
		const cancelledBeforeLaunch = record.state === "PENDING";
		if (cancelledBeforeLaunch) {
			this.transition(record, "CANCEL_REQUESTED");
			return {
				accepted: true,
				alreadyTerminal: false,
				unknownHandle: false,
				unsupported: false,
				staleOwner: false,
				state: record.state,
			};
		}
		if (!record.adapter.cancel) {
			return {
				accepted: false,
				alreadyTerminal: false,
				unknownHandle: false,
				unsupported: true,
				staleOwner: false,
				state: record.state,
			};
		}
		const accepted = await record.adapter.cancel(cloneHandle(record.handle), bounded(reason, 500) ?? "", commandId);
		if (accepted && !isMaestroTerminalState(record.state) && record.state !== "CANCEL_REQUESTED") {
			this.transition(record, "CANCEL_REQUESTED");
		}
		return {
			accepted,
			alreadyTerminal: isMaestroTerminalState(record.state),
			unknownHandle: false,
			unsupported: !accepted,
			staleOwner: false,
			state: record.state,
		};
	}

	async cancelAttached(
		handle: MaestroHandle,
		attachment: MaestroAttachment,
		reason: string,
		commandId?: string,
	): Promise<MaestroCancelResult> {
		const record = this.findRecord(handle);
		if (
			!record ||
			!record.owner ||
			record.owner.instanceId !== attachment.instanceId ||
			record.owner.ownerId !== attachment.ownerId ||
			record.owner.ownerGeneration !== attachment.ownerGeneration ||
			!capabilitiesEqual(record.owner.capability, attachment.capability)
		) {
			return {
				accepted: false,
				alreadyTerminal: false,
				unknownHandle: !record,
				unsupported: false,
				staleOwner: Boolean(record),
				state: record?.state ?? "UNKNOWN",
			};
		}
		return await this.cancel(handle, reason, commandId);
	}

	result(handle: MaestroHandle): MaestroResult {
		this.cleanupExpired();
		const record = this.findRecord(handle);
		if (!record) {
			return {
				handle: hasValidHandleShape(handle) ? cloneHandle(handle) : this.unknownHandle(),
				terminalState: "UNKNOWN",
				ready: false,
				errorClassification: "UNKNOWN_HANDLE",
			};
		}
		return record.result
			? { ...record.result, handle: cloneHandle(record.result.handle) }
			: {
					handle: cloneHandle(record.handle),
					terminalState: record.state,
					ready: false,
					errorClassification: "NOT_READY",
				};
	}

	async reconnect(handle: MaestroHandle): Promise<MaestroReconnectResult> {
		const record = this.findRecord(handle);
		if (!record) return { connected: false, state: "UNKNOWN", diagnostic: "RECONNECT_UNAVAILABLE" };
		if (!record.adapter.reconnect)
			return { connected: false, state: record.state, diagnostic: "RECONNECT_UNSUPPORTED" };
		return await record.adapter.reconnect(cloneHandle(record.handle), this.snapshot(record));
	}

	attach(handle: MaestroHandle, ownerId: string): MaestroAttachment {
		const record = this.requireRecord(handle);
		if (!ownerId || ownerId.length > 512) {
			throw new MaestroLifecycleError("INVALID_REQUEST", "ownerId must contain 1 to 512 characters");
		}
		if (record.owner) {
			throw new MaestroLifecycleError(
				"OWNER_ATTACHED",
				`Interactive owner already attached: ${record.owner.ownerId}`,
			);
		}
		record.ownerGeneration += 1;
		record.owner = {
			instanceId: record.handle.instanceId,
			ownerId,
			ownerGeneration: record.ownerGeneration,
			capability: randomBytes(32).toString("base64url"),
		};
		return { ...record.owner };
	}

	detach(attachment: MaestroAttachment): MaestroDetachResult {
		this.cleanupExpired();
		const record = this.records.get(attachment.instanceId);
		if (
			!record ||
			!record.owner ||
			record.owner.ownerId !== attachment.ownerId ||
			record.owner.ownerGeneration !== attachment.ownerGeneration ||
			!capabilitiesEqual(record.owner.capability, attachment.capability)
		) {
			return { detached: false, stale: true, state: record?.state ?? "UNKNOWN" };
		}
		record.owner = undefined;
		return { detached: true, stale: false, state: record.state };
	}

	subscribe(handle: MaestroHandle, listener: (event: Readonly<MaestroLifecycleEvent>) => void): () => void {
		const record = this.requireRecord(handle);
		record.subscribers.add(listener);
		return () => record.subscribers.delete(listener);
	}

	async stop(handle: MaestroHandle): Promise<MaestroTerminalStatus> {
		const record = this.findRecord(handle);
		if (!record) return this.terminalStatus(handle, "UNKNOWN", true, false, "UNKNOWN_HANDLE");
		if (isMaestroTerminalState(record.state)) return this.terminalStatus(record.handle, record.state, true, false);
		if (record.state !== "CANCEL_REQUESTED") this.transition(record, "CANCEL_REQUESTED");
		await record.adapter.stop?.(cloneHandle(record.handle));
		if (!isMaestroTerminalState(record.state))
			this.complete(record, { state: "CANCELLED", summary: "Stopped by Maestro" });
		return this.terminalStatus(record.handle, record.state, true, false);
	}

	private async runLaunch(record: LifecycleRecord): Promise<void> {
		if (isMaestroTerminalState(record.state)) return;
		if (record.state === "CANCEL_REQUESTED") {
			this.complete(record, { state: "CANCELLED", summary: "Cancelled before launch" });
			return;
		}
		try {
			if (record.state === "PENDING") this.transition(record, "STARTING");
			const completion = await record.adapter.launch(record.request, {
				handle: cloneHandle(record.handle),
				transition: (state, updates) => {
					if (isMaestroTerminalState(record.state)) return;
					this.applyUpdates(record, updates);
					if (record.state !== state) this.transition(record, state);
				},
				update: (updates) => {
					if (!isMaestroTerminalState(record.state)) this.applyUpdates(record, updates);
				},
			});
			if (isMaestroTerminalState(record.state)) return;
			if (record.state === "STARTING") this.transition(record, "RUNNING");
			this.complete(record, { ...completion, state: normalizeCompletionState(record.state, completion.state) });
		} catch (error) {
			if (isMaestroTerminalState(record.state)) return;
			this.complete(record, {
				state: "FAILED",
				errorClassification: error instanceof Error ? error.name : "Error",
				errorMessage: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private complete(record: LifecycleRecord, completion: MaestroLifecycleCompletion): void {
		record.completedAt = this.timestamp();
		const unhashed: MaestroResult = {
			handle: cloneHandle(record.handle),
			terminalState: completion.state,
			ready: true,
			summary: bounded(completion.summary, MAX_RESULT_CHARS),
			startedAt: record.startedAt,
			completedAt: record.completedAt,
			errorClassification: bounded(completion.errorClassification, 256),
			errorMessage: bounded(completion.errorMessage, MAX_RESULT_CHARS),
		};
		const resultHash = completion.resultHash ?? createHash("sha256").update(JSON.stringify(unhashed)).digest("hex");
		record.result = {
			...unhashed,
			resultHash,
			handoffState: completion.handoffState ?? "not-required",
			handoffDiagnostic: bounded(completion.handoffDiagnostic, MAX_RESULT_CHARS),
		};
		this.transition(record, completion.state);
		if ((record.handle.parentInstanceId || record.handle.parentSessionId) && !completion.handoffState) {
			if (!this.completionQueue) {
				record.result.handoffState = "failed";
				record.result.handoffDiagnostic = "COMPLETION_QUEUE_UNAVAILABLE";
			} else {
				try {
					this.completionQueue.enqueue({
						parentInstanceId: record.handle.parentInstanceId,
						parentSessionId: record.handle.parentSessionId,
						childInstanceId: record.handle.instanceId,
						childSessionId: record.runtime.sessionId,
						terminalState: completion.state,
						summary: completion.summary ?? completion.errorMessage,
						resultHash,
						completedAt: record.completedAt,
					});
					record.result.handoffState = "queued";
				} catch (error) {
					record.result.handoffState = "failed";
					record.result.handoffDiagnostic = bounded(
						`COMPLETION_ENQUEUE_FAILED: ${error instanceof Error ? error.message : String(error)}`,
						MAX_RESULT_CHARS,
					);
				}
			}
		}
		record.resolveCompletion();
	}

	private transition(record: LifecycleRecord, state: Exclude<MaestroLifecycleState, "UNKNOWN">): void {
		if (!isLegalMaestroTransition(record.state, state)) {
			throw new MaestroLifecycleError(
				"INVALID_TRANSITION",
				`Illegal lifecycle transition: ${record.state} -> ${state}`,
			);
		}
		record.state = state;
		record.updatedAt = this.timestamp();
		if (state === "RUNNING" && !record.startedAt) record.startedAt = record.updatedAt;
		this.emit(record);
	}

	private applyUpdates(
		record: LifecycleRecord,
		updates: { runtime?: MaestroRuntimeIdentity; progress?: MaestroProgressSnapshot } | undefined,
	): void {
		if (!updates) return;
		if (updates.runtime) record.runtime = normalizeRuntime(updates.runtime, record.handle.kind);
		if (updates.progress) {
			record.progress = {
				message: bounded(updates.progress.message, MAX_PROGRESS_CHARS),
				outputTail: bounded(updates.progress.outputTail, MAX_RESULT_CHARS),
			};
		}
		record.updatedAt = this.timestamp();
		this.emit(record);
	}

	private emit(record: LifecycleRecord): void {
		const event: MaestroLifecycleEvent = {
			instanceId: record.handle.instanceId,
			state: record.state,
			updatedAt: record.updatedAt,
			progress: cloneProgress(record.progress),
		};
		for (const subscriber of record.subscribers) {
			try {
				subscriber({ ...event, progress: cloneProgress(event.progress) });
			} catch {
				// Observers are isolated from lifecycle state and completion control flow.
			}
		}
	}

	private findRecord(handle: MaestroHandle): LifecycleRecord | undefined {
		this.cleanupExpired();
		if (!hasValidHandleShape(handle)) return undefined;
		const record = this.records.get(handle.instanceId);
		if (!record || !capabilitiesEqual(record.handle.capability, handle.capability)) return undefined;
		if (
			record.handle.contractVersion !== handle.contractVersion ||
			record.handle.kind !== handle.kind ||
			record.handle.createdAt !== handle.createdAt ||
			record.handle.parentInstanceId !== handle.parentInstanceId ||
			record.handle.parentSessionId !== handle.parentSessionId ||
			record.handle.correlationId !== handle.correlationId
		)
			return undefined;
		return record;
	}

	private requireRecord(handle: MaestroHandle): LifecycleRecord {
		const record = this.findRecord(handle);
		if (!record) throw new MaestroLifecycleError("INVALID_HANDLE", "Invalid, stale, or forged lifecycle handle");
		return record;
	}

	private snapshot(record: LifecycleRecord): MaestroStatus {
		return {
			handle: cloneHandle(record.handle),
			state: record.state,
			updatedAt: record.updatedAt,
			startedAt: record.startedAt,
			completedAt: record.completedAt,
			ownerGeneration: record.ownerGeneration,
			runtime: cloneRuntime(record.runtime),
			progress: cloneProgress(record.progress),
		};
	}

	private cleanupExpired(): void {
		const cutoff = this.now().getTime() - this.terminalRetentionMs;
		for (const [instanceId, record] of this.records) {
			if (!record.completedAt || Date.parse(record.completedAt) >= cutoff) continue;
			this.records.delete(instanceId);
			if (record.handle.correlationId) this.correlations.delete(this.correlationKey(record.request));
		}
	}

	private correlationKey(
		request: Pick<MaestroLaunchRequest, "parentInstanceId" | "parentSessionId" | "correlationId">,
	): string {
		return `${request.parentInstanceId ?? ""}\0${request.parentSessionId ?? ""}\0${request.correlationId ?? ""}`;
	}

	private timestamp(): string {
		return this.now().toISOString();
	}

	private async waitForCompletion(completion: Promise<void>, timeoutMs: number | undefined): Promise<boolean> {
		if (timeoutMs === undefined) {
			await completion;
			return true;
		}
		return await new Promise<boolean>((resolve) => {
			const timer = setTimeout(() => resolve(false), timeoutMs);
			void completion.then(() => {
				clearTimeout(timer);
				resolve(true);
			});
		});
	}

	private terminalStatus(
		handle: MaestroHandle,
		state: MaestroLifecycleState,
		completed: boolean,
		timedOut: boolean,
		diagnostic?: string,
	): MaestroTerminalStatus {
		return {
			handle: hasValidHandleShape(handle) ? cloneHandle(handle) : this.unknownHandle(),
			state,
			completed,
			timedOut,
			diagnostic,
		};
	}

	private unknownHandle(): MaestroHandle {
		return {
			contractVersion: MAESTRO_LIFECYCLE_CONTRACT_VERSION,
			instanceId: "unknown",
			kind: "full-session",
			createdAt: this.timestamp(),
			capability: "unknown".repeat(5),
		};
	}
}
