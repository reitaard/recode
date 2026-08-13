import { createHash, randomUUID } from "node:crypto";
import type {
	AgentSessionEvent,
	AgentSessionEventListener,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@reitaard/recode-coding-agent";
import { type EnqueueCompletionInput, MaestroCompletionQueue } from "./completion-queue.ts";
import { MaestroFullSessionLifecycleAdapter } from "./lifecycle-adapters.ts";
import type {
	MaestroAttachment,
	MaestroHandle,
	MaestroLaunchRequest,
	MaestroResult,
	MaestroStatus,
} from "./lifecycle-contract.ts";
import { type MaestroLifecycleCompletion, MaestroLifecycleService } from "./lifecycle-service.ts";
import { verifyProcessIdentity } from "./process-identity.ts";
import { radiusPresence } from "./radius.ts";
import { createRpcProcessInstance, type RpcCancellationResult, type RpcDisposeResult } from "./rpc-process.ts";
import { getInstance, loadInstances, saveInstances, upsertInstance } from "./storage.ts";
import { SessionTurnLeaseRegistry, type SessionTurnLeaseToken } from "./turn-lease.ts";
import type {
	CompletionRecord,
	InstanceRecord,
	InstanceStatus,
	ProcessIdentityRecord,
	WorkspaceAccessMode,
	WorkspaceOwnershipReceipt,
} from "./types.ts";
import {
	assertWorkspaceAdmission,
	inspectWorkspaceOwnership,
	verifyWorkspaceOwnershipReceipt,
} from "./workspace-safety.ts";

const DEFAULT_MAX_EVENT_TAIL_ENTRIES = 64;
const DEFAULT_MAX_EVENT_TAIL_BYTES = 262_144;
const MAX_REPLAY_EVENT_BYTES = 65_536;
const MAX_ACTIVITY_CHARS = 256;
const MAX_LATEST_OUTPUT_CHARS = 2_048;
const PRESENCE_DISCONNECT_DEADLINE_MS = 2_000;

const READ_ONLY_RPC_COMMANDS: ReadonlySet<RpcCommand["type"]> = new Set([
	"get_state",
	"get_available_models",
	"get_session_stats",
	"get_fork_messages",
	"get_entries",
	"get_tree",
	"get_last_assistant_text",
	"get_messages",
	"get_commands",
]);

export type RpcStreamMode = "interactive" | "read-only";

export interface RpcStreamAttachmentInfo {
	mode: RpcStreamMode;
	ownerId?: string;
	ownerGeneration?: number;
}

export interface RpcStreamReplay {
	events: AgentSessionEvent[];
	pendingUiRequest?: RpcExtensionUIRequest;
}

export class InteractiveOwnerAttachedError extends Error {
	readonly instanceId: string;
	readonly ownerId: string;

	constructor(instanceId: string, ownerId: string) {
		super(`Interactive owner already attached to ${instanceId}: ${ownerId}`);
		this.name = "InteractiveOwnerAttachedError";
		this.instanceId = instanceId;
		this.ownerId = ownerId;
	}
}

export interface SupervisorRpcProcess {
	readonly processIdentity?: ProcessIdentityRecord;
	send(command: RpcCommand): Promise<RpcResponse>;
	handleUiResponse(response: RpcExtensionUIResponse): void;
	onEvent(listener: AgentSessionEventListener): () => void;
	onExit(listener: (error?: Error) => void): () => void;
	setUiRequestHandler(handler: ((request: RpcExtensionUIRequest) => void) | undefined): void;
	cancel?(commandId: string): Promise<RpcCancellationResult>;
	dispose(): Promise<RpcDisposeResult | undefined>;
	detach?(): Promise<void>;
}

export const DEFAULT_MAX_LIVE_INSTANCES = 10;

export interface OrchestratorSupervisorOptions {
	createRpcProcess?: (options: { cwd: string; workspaceAccess: WorkspaceAccessMode }) => SupervisorRpcProcess;
	maxLiveInstances?: number;
	maxSubscribersPerInstance?: number;
	turnLeaseRegistry?: SessionTurnLeaseRegistry;
	turnLeaseTimeoutMs?: number;
	maxEventTailEntries?: number;
	maxEventTailBytes?: number;
	completionQueue?: MaestroCompletionQueue;
	inspectProcessIdentity?: (pid: number) => Promise<ProcessIdentityRecord | undefined>;
	reconnectRpcProcess?: (instance: Readonly<InstanceRecord>) => Promise<SupervisorRpcProcess | undefined>;
	inspectWorkspace?: (
		workspace: string,
		access: WorkspaceAccessMode,
		ownerInstanceId: string,
	) => WorkspaceOwnershipReceipt;
	verifyWorkspaceReceipt?: (receipt: Readonly<WorkspaceOwnershipReceipt>) => boolean;
	presence?: {
		registerPi(instance: InstanceRecord): Promise<InstanceRecord>;
		disconnectPi(instance: InstanceRecord): Promise<void>;
	};
}

interface LiveInstanceResources {
	rpcProcess?: SupervisorRpcProcess;
	radiusPiId?: string;
	sessionId?: string;
}

interface CleanupOutcome {
	termination?: RpcDisposeResult;
	diagnostic?: string;
}

interface RetainedEvent {
	event: AgentSessionEvent;
	bytes: number;
}

interface InteractiveOwner {
	ownerId: string;
	ownerGeneration: number;
	lifecycleAttachment?: MaestroAttachment;
	onUiRequest(request: RpcExtensionUIRequest): void;
}

interface LiveInstance {
	record: InstanceRecord;
	resources: LiveInstanceResources;
	subscribers: Set<AgentSessionEventListener>;
	interactiveOwner?: InteractiveOwner;
	nextOwnerGeneration: number;
	pendingUiRequest?: RpcExtensionUIRequest;
	eventTail: RetainedEvent[];
	eventTailBytes: number;
	turnLease?: SessionTurnLeaseToken;
	nextTurnGeneration: number;
	identitySync: Promise<void>;
	completionDelivery: Promise<number>;
	terminalCompletion: Promise<MaestroLifecycleCompletion>;
	resolveTerminalCompletion(completion: MaestroLifecycleCompletion): void;
	terminalCompletionResolved: boolean;
	unsubscribeEvents?: () => void;
	unsubscribeExit?: () => void;
}

function cloneInstance(record: InstanceRecord): InstanceRecord {
	return {
		...record,
		workspaceReceipt: record.workspaceReceipt ? { ...record.workspaceReceipt } : undefined,
	};
}

// Only refresh persisted session metadata after commands that can plausibly change
// the instance identity/details we store in instances.json. Most RPCs mutate transient
// runtime state only, so forcing a follow-up get_state after every command is wasted IO.
//
// - new_session / switch_session / fork / clone can change sessionId/sessionFile
// - set_session_name changes a persisted session detail we may want reflected externally
// Prompt identity is synchronized at compaction/settled lifecycle boundaries while its turn lease is held.
const SESSION_METADATA_COMMANDS: ReadonlySet<RpcCommand["type"]> = new Set([
	"new_session",
	"switch_session",
	"fork",
	"clone",
	"set_session_name",
]);

function shouldRefreshSessionMetadata(command: RpcCommand): boolean {
	return SESSION_METADATA_COMMANDS.has(command.type);
}

function isWorkspaceReadOnlyCommand(command: RpcCommand): boolean {
	if (command.type === "bash" || command.type === "export_html") return false;
	return command.type !== "prompt" || !command.message.trimStart().startsWith("/");
}

function sanitizeDashboardText(value: string, maxChars: number): string {
	return value
		.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, "")
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(-maxChars);
}

function isGetStateSuccess(
	response: RpcResponse,
): response is Extract<
	RpcResponse,
	{ success: true; command: "get_state"; data: { sessionId: string; sessionFile?: string } }
> {
	return response.success === true && response.command === "get_state" && "data" in response;
}

function isCompletionHandoffSuccess(
	response: RpcResponse,
): response is Extract<RpcResponse, { success: true; command: "maestro_completion_handoff" }> {
	return response.success === true && response.command === "maestro_completion_handoff";
}

function cancellationResultKey(instanceId: string, commandId?: string): string {
	return `${instanceId}\0${commandId ?? ""}`;
}

function createTerminalResultHash(
	instance: Readonly<InstanceRecord>,
	state: MaestroLifecycleCompletion["state"],
	summary: string | undefined,
	completedAt: string,
): string {
	return createHash("sha256")
		.update(JSON.stringify({ instanceId: instance.id, sessionId: instance.sessionId, state, summary, completedAt }))
		.digest("hex");
}

function isBlockingUiRequest(request: RpcExtensionUIRequest): boolean {
	return (
		request.method === "select" ||
		request.method === "confirm" ||
		request.method === "input" ||
		request.method === "editor"
	);
}

function cloneBoundedJson<T>(value: T, maxBytes: number): { value: T; bytes: number } | undefined {
	const serialized = JSON.stringify(value);
	const bytes = Buffer.byteLength(serialized);
	if (bytes > maxBytes) return undefined;
	return { value: JSON.parse(serialized) as T, bytes };
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	return await new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
		timer.unref();
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

function createLiveInstance(record: InstanceRecord, resources: LiveInstanceResources = {}): LiveInstance {
	let resolveTerminalCompletion = (_completion: MaestroLifecycleCompletion): void => undefined;
	const terminalCompletion = new Promise<MaestroLifecycleCompletion>((resolve) => {
		resolveTerminalCompletion = resolve;
	});
	return {
		record,
		resources,
		subscribers: new Set(),
		nextOwnerGeneration: 0,
		pendingUiRequest: record.pendingUiRequest,
		eventTail: [],
		eventTailBytes: 0,
		nextTurnGeneration: 0,
		identitySync: Promise.resolve(),
		completionDelivery: Promise.resolve(0),
		terminalCompletion,
		resolveTerminalCompletion,
		terminalCompletionResolved: false,
	};
}

export class OrchestratorSupervisor {
	private readonly liveInstances = new Map<string, LiveInstance>();
	private readonly lifecycleHandles = new Map<string, Readonly<MaestroHandle>>();
	private readonly lifecycle: MaestroLifecycleService;
	private readonly lastCancellationResults = new Map<string, RpcCancellationResult>();
	private readonly createRpcProcess: (options: {
		cwd: string;
		workspaceAccess: WorkspaceAccessMode;
	}) => SupervisorRpcProcess;
	private readonly presence: NonNullable<OrchestratorSupervisorOptions["presence"]>;
	private readonly maxLiveInstances: number;
	private readonly maxSubscribersPerInstance: number;
	private readonly turnLeases: SessionTurnLeaseRegistry;
	private readonly turnLeaseTimeoutMs: number;
	private readonly maxEventTailEntries: number;
	private readonly maxEventTailBytes: number;
	private readonly completionQueue: MaestroCompletionQueue;
	private readonly inspectProcessIdentity?: NonNullable<OrchestratorSupervisorOptions["inspectProcessIdentity"]>;
	private readonly reconnectRpcProcess?: NonNullable<OrchestratorSupervisorOptions["reconnectRpcProcess"]>;
	private readonly inspectWorkspace: NonNullable<OrchestratorSupervisorOptions["inspectWorkspace"]>;
	private readonly verifyWorkspaceReceipt: NonNullable<OrchestratorSupervisorOptions["verifyWorkspaceReceipt"]>;

	constructor(options: OrchestratorSupervisorOptions = {}) {
		this.createRpcProcess = options.createRpcProcess ?? createRpcProcessInstance;
		this.presence = options.presence ?? radiusPresence;
		this.maxLiveInstances = options.maxLiveInstances ?? DEFAULT_MAX_LIVE_INSTANCES;
		this.maxSubscribersPerInstance = options.maxSubscribersPerInstance ?? 16;
		this.turnLeaseTimeoutMs = options.turnLeaseTimeoutMs ?? 30_000;
		this.turnLeases =
			options.turnLeaseRegistry ?? new SessionTurnLeaseRegistry({ defaultTimeoutMs: this.turnLeaseTimeoutMs });
		this.maxEventTailEntries = options.maxEventTailEntries ?? DEFAULT_MAX_EVENT_TAIL_ENTRIES;
		this.maxEventTailBytes = options.maxEventTailBytes ?? DEFAULT_MAX_EVENT_TAIL_BYTES;
		this.completionQueue = options.completionQueue ?? new MaestroCompletionQueue();
		this.inspectProcessIdentity = options.inspectProcessIdentity;
		this.reconnectRpcProcess = options.reconnectRpcProcess;
		this.inspectWorkspace = options.inspectWorkspace ?? inspectWorkspaceOwnership;
		this.verifyWorkspaceReceipt = options.verifyWorkspaceReceipt ?? verifyWorkspaceOwnershipReceipt;
		const fullSessionAdapter = new MaestroFullSessionLifecycleAdapter(async (request, update, handle) => {
			const recovered = request.metadata?.recovered === true;
			const instance = recovered
				? this.getLiveInstance(handle.instanceId)
				: await this.spawnManagedInstance({
						instanceId: handle.instanceId,
						cwd: request.cwd,
						workspaceAccess: request.workspaceAccess,
						label: typeof request.metadata?.label === "string" ? request.metadata.label : undefined,
						parentInstanceId: request.parentInstanceId,
						parentSessionId: request.parentSessionId,
					});
			const live = instance ? this.liveInstances.get(instance.id) : undefined;
			if (!instance?.processIdentity && process.platform !== "win32" && process.platform !== "linux") {
				throw new Error("Maestro full-session supervision is supported only on Windows and Linux");
			}
			if (!live || !instance?.processIdentity || !instance.sessionId || !instance.workspaceReceipt) {
				throw new Error("Full-session launch did not produce a complete runtime identity");
			}
			update({ message: "Session ready", outputTail: instance.latestOutput });
			return {
				identity: {
					cwd: instance.cwd,
					worktreeIdentity: instance.workspaceReceipt.worktreeIdentity,
					process: instance.processIdentity,
					sessionId: instance.sessionId,
					sessionFile: instance.sessionFile,
				},
				waitingInput: instance.status === "waiting-input",
				completion: live.terminalCompletion,
				cancel: async (_reason, commandId) => {
					const cancellation = await this.cancelManagedInstance(instance.id, commandId);
					this.lastCancellationResults.set(cancellationResultKey(instance.id, commandId), cancellation);
					return cancellation.accepted;
				},
				stop: async () => {
					await this.stopManagedInstance(instance.id);
				},
				reconnect: async () => ({
					connected: this.liveInstances.has(instance.id),
					state: this.liveInstances.has(instance.id) ? "RUNNING" : "UNKNOWN",
					diagnostic: this.liveInstances.has(instance.id) ? undefined : "RECONNECT_UNAVAILABLE",
				}),
			};
		});
		this.lifecycle = new MaestroLifecycleService({ adapters: [fullSessionAdapter] });
		if (!Number.isSafeInteger(this.maxLiveInstances) || this.maxLiveInstances < 1) {
			throw new Error("maxLiveInstances must be a positive safe integer");
		}
		if (!Number.isSafeInteger(this.maxSubscribersPerInstance) || this.maxSubscribersPerInstance < 1) {
			throw new Error("maxSubscribersPerInstance must be a positive safe integer");
		}
		if (!Number.isFinite(this.turnLeaseTimeoutMs) || this.turnLeaseTimeoutMs < 0) {
			throw new Error("turnLeaseTimeoutMs must be a non-negative finite number");
		}
		if (!Number.isSafeInteger(this.maxEventTailEntries) || this.maxEventTailEntries < 1) {
			throw new Error("maxEventTailEntries must be a positive safe integer");
		}
		if (!Number.isSafeInteger(this.maxEventTailBytes) || this.maxEventTailBytes < 1) {
			throw new Error("maxEventTailBytes must be a positive safe integer");
		}
	}

	private setStatus(live: LiveInstance, status: InstanceStatus): void {
		live.record = {
			...live.record,
			status,
			lastSeenAt: new Date().toISOString(),
		};
		upsertInstance(live.record);
	}

	private updateRecord(live: LiveInstance, updates: Partial<InstanceRecord>): void {
		live.record = {
			...live.record,
			...updates,
			lastSeenAt: new Date().toISOString(),
		};
		if (updates.radiusPiId !== undefined) {
			live.resources.radiusPiId = updates.radiusPiId;
		}
		if (updates.sessionId !== undefined) {
			live.resources.sessionId = updates.sessionId;
		}
		upsertInstance(live.record);
	}

	private enqueuePersistedCompletion(instance: InstanceRecord): InstanceRecord {
		if (
			instance.completionQueuedAt ||
			(!instance.parentInstanceId && !instance.parentSessionId) ||
			!instance.terminalState ||
			!instance.terminalResultHash ||
			!instance.completedAt
		)
			return instance;
		this.enqueueCompletion({
			parentInstanceId: instance.parentInstanceId,
			parentSessionId: instance.parentSessionId,
			childInstanceId: instance.id,
			childSessionId: instance.sessionId,
			terminalState: instance.terminalState,
			summary: instance.terminalSummary,
			resultHash: instance.terminalResultHash,
			completedAt: instance.completedAt,
		});
		return { ...instance, completionQueuedAt: new Date().toISOString() };
	}

	private completeManagedInstance(live: LiveInstance, completion: MaestroLifecycleCompletion): void {
		if (live.terminalCompletionResolved) return;
		live.terminalCompletionResolved = true;
		const completedAt = live.record.completedAt ?? new Date().toISOString();
		const summary = (completion.summary ?? completion.errorMessage ?? live.record.latestOutput)
			?.trim()
			.slice(0, 4_000);
		const resultHash = createTerminalResultHash(live.record, completion.state, summary, completedAt);
		this.updateRecord(live, {
			completedAt,
			terminalState: completion.state,
			terminalSummary: summary || undefined,
			terminalResultHash: resultHash,
		});
		let handoffState: MaestroLifecycleCompletion["handoffState"] = "not-required";
		let handoffDiagnostic: string | undefined;
		if (live.record.parentInstanceId || live.record.parentSessionId) {
			try {
				live.record = this.enqueuePersistedCompletion(live.record);
				upsertInstance(live.record);
				handoffState = "queued";
			} catch (error) {
				handoffState = "failed";
				handoffDiagnostic =
					`COMPLETION_ENQUEUE_FAILED: ${error instanceof Error ? error.message : String(error)}`.slice(0, 4096);
				this.updateRecord(live, { terminalDiagnostic: handoffDiagnostic });
			}
		}
		live.resolveTerminalCompletion({
			...completion,
			summary,
			resultHash,
			handoffState,
			handoffDiagnostic,
		});
	}

	private cleanupLifecycleHandles(): void {
		for (const [instanceId, handle] of this.lifecycleHandles) {
			if (this.lifecycle.status(handle).state === "UNKNOWN") this.lifecycleHandles.delete(instanceId);
		}
	}

	private async waitForLifecycleStart(handle: Readonly<MaestroHandle>): Promise<void> {
		const initial = this.lifecycle.status(handle);
		if (initial.state === "RUNNING" || initial.state === "WAITING_INPUT") return;
		if (initial.state === "FAILED" || initial.state === "INTERRUPTED" || initial.state === "CANCELLED") {
			const result = this.lifecycle.result(handle);
			throw new Error(result.errorMessage ?? result.summary ?? `Maestro launch ended in ${initial.state}`);
		}
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			let unsubscribe = (): void => undefined;
			const observe = (state: MaestroStatus["state"]): void => {
				if (settled) return;
				if (state === "RUNNING" || state === "WAITING_INPUT") {
					settled = true;
					unsubscribe();
					resolve();
					return;
				}
				if (state === "FAILED" || state === "INTERRUPTED" || state === "CANCELLED") {
					settled = true;
					unsubscribe();
					queueMicrotask(() => {
						const result = this.lifecycle.result(handle);
						reject(new Error(result.errorMessage ?? result.summary ?? `Maestro launch ended in ${state}`));
					});
				}
			};
			unsubscribe = this.lifecycle.subscribe(handle, (event) => observe(event.state));
			observe(this.lifecycle.status(handle).state);
		});
	}

	private releaseTurnLease(live: LiveInstance, token = live.turnLease): boolean {
		if (!token) return false;
		const released = this.turnLeases.release(token);
		if (live.turnLease === token) live.turnLease = undefined;
		return released;
	}

	private queueSessionIdentitySync(live: LiveInstance, releaseAfterSync: boolean): void {
		const token = live.turnLease;
		if (!token) return;
		live.identitySync = live.identitySync
			.catch(() => undefined)
			.then(async () => {
				try {
					await this.syncInstanceRecord(live);
					const resolvedSessionId = live.record.sessionId;
					if (resolvedSessionId && resolvedSessionId !== token.sessionId) {
						this.turnLeases.rebind(token, resolvedSessionId);
					}
				} finally {
					if (releaseAfterSync) this.releaseTurnLease(live, token);
				}
			})
			.catch((error: unknown) => {
				console.error(`Failed to synchronize session identity for ${live.record.id}: ${String(error)}`);
			});
	}

	enqueueCompletion(input: EnqueueCompletionInput): CompletionRecord {
		const record = this.completionQueue.enqueue(input);
		const parent = record.parentInstanceId
			? this.liveInstances.get(record.parentInstanceId)
			: [...this.liveInstances.values()].find((live) => live.record.sessionId === record.parentSessionId);
		if (parent) void this.deliverCompletions(parent.record.id);
		return record;
	}

	deliverCompletions(instanceId: string): Promise<number> {
		const live = this.liveInstances.get(instanceId);
		if (!live?.resources.rpcProcess) return Promise.resolve(0);
		live.completionDelivery = live.completionDelivery
			.catch(() => 0)
			.then(async () => await this.deliverCompletionClaims(live));
		return live.completionDelivery;
	}

	private async deliverCompletionClaims(live: LiveInstance): Promise<number> {
		const rpcProcess = this.getRpcProcess(live);
		if (!rpcProcess) return 0;
		const claims = this.completionQueue.claim(
			{ instanceId: live.record.id, sessionId: live.record.sessionId },
			`maestro:${live.record.id}`,
		);
		let acknowledged = 0;
		for (const claim of claims) {
			try {
				const response = await rpcProcess.send({
					type: "maestro_completion_handoff",
					deliveryId: claim.record.id,
					childInstanceId: claim.record.childInstanceId,
					childSessionId: claim.record.childSessionId,
					terminalState: claim.record.terminalState,
					summary: claim.record.summary,
					resultHash: claim.record.resultHash,
					completedAt: claim.record.completedAt,
				});
				if (isCompletionHandoffSuccess(response) && response.data.delivered) {
					if (this.completionQueue.acknowledge(claim)) acknowledged += 1;
				} else {
					this.completionQueue.release(claim);
				}
			} catch {
				this.completionQueue.release(claim);
			}
		}
		return acknowledged;
	}

	private updateDashboardActivity(live: LiveInstance, event: AgentSessionEvent): void {
		let activity: string | undefined;
		switch (event.type) {
			case "agent_start":
			case "turn_start":
				activity = "Thinking";
				break;
			case "tool_execution_start":
				activity = `Running ${event.toolName}`;
				break;
			case "compaction_start":
				activity = "Compacting context";
				break;
			case "auto_retry_start":
				activity = `Retrying ${event.attempt}/${event.maxAttempts}`;
				break;
			case "agent_settled":
				activity = "Idle";
				break;
			case "message_update":
				if (event.assistantMessageEvent.type === "text_delta") {
					live.record.latestOutput = sanitizeDashboardText(
						`${live.record.latestOutput ?? ""}${event.assistantMessageEvent.delta}`,
						MAX_LATEST_OUTPUT_CHARS,
					);
				}
				activity = "Responding";
				break;
		}
		if (activity) {
			live.record.currentActivity = sanitizeDashboardText(activity, MAX_ACTIVITY_CHARS);
			live.record.activityUpdatedAt = new Date().toISOString();
		}
	}

	private retainEvent(live: LiveInstance, event: AgentSessionEvent): void {
		this.updateDashboardActivity(live, event);
		const retained = cloneBoundedJson(event, MAX_REPLAY_EVENT_BYTES);
		if (!retained) return;
		live.eventTail.push({ event: retained.value, bytes: retained.bytes });
		live.eventTailBytes += retained.bytes;
		while (live.eventTail.length > this.maxEventTailEntries || live.eventTailBytes > this.maxEventTailBytes) {
			const removed = live.eventTail.shift();
			if (removed) live.eventTailBytes -= removed.bytes;
		}
	}

	private handleUiRequest(live: LiveInstance, request: RpcExtensionUIRequest): void {
		const retained = cloneBoundedJson(request, MAX_REPLAY_EVENT_BYTES)?.value;
		if (isBlockingUiRequest(request) && !retained) {
			live.resources.rpcProcess?.handleUiResponse({
				type: "extension_ui_response",
				id: request.id,
				cancelled: true,
			});
			return;
		}
		const owner = live.interactiveOwner;
		if (isBlockingUiRequest(request)) {
			live.pendingUiRequest = retained;
			const lifecycleHandle = this.lifecycleHandles.get(live.record.id);
			if (lifecycleHandle) this.lifecycle.setWaitingInput(lifecycleHandle, true);
			live.record.currentActivity = "Waiting for input";
			live.record.activityUpdatedAt = new Date().toISOString();
			this.updateRecord(live, {
				pendingUiRequest: retained,
				status: owner || live.record.status !== "online" ? live.record.status : "waiting-input",
			});
		}
		if (owner) owner.onUiRequest(request);
	}

	private clearBindings(live: LiveInstance): void {
		live.unsubscribeEvents?.();
		live.unsubscribeExit?.();
		live.unsubscribeEvents = undefined;
		live.unsubscribeExit = undefined;
		live.resources.rpcProcess?.setUiRequestHandler(undefined);
	}

	private bindRpcProcess(live: LiveInstance, rpcProcess: SupervisorRpcProcess): void {
		this.clearBindings(live);
		live.resources.rpcProcess = rpcProcess;
		live.unsubscribeEvents = rpcProcess.onEvent((event) => {
			this.retainEvent(live, event);
			if (event.type === "compaction_end") this.queueSessionIdentitySync(live, false);
			if (event.type === "agent_settled") {
				this.queueSessionIdentitySync(live, true);
				void this.deliverCompletions(live.record.id);
			}
			for (const subscriber of live.subscribers) {
				try {
					subscriber(event);
				} catch {
					// Read-only observers cannot interrupt lifecycle routing or other observers.
				}
			}
		});
		live.unsubscribeExit = rpcProcess.onExit((error) => {
			void this.handleUnexpectedRpcExit(live, error);
		});
		rpcProcess.setUiRequestHandler((request) => this.handleUiRequest(live, request));
	}

	private async handleUnexpectedRpcExit(live: LiveInstance, error?: Error): Promise<void> {
		if (this.liveInstances.get(live.record.id) !== live) {
			return;
		}
		if (live.record.status === "stopping" || live.record.status === "stopped") {
			return;
		}
		this.releaseTurnLease(live);
		live.pendingUiRequest = undefined;
		this.updateRecord(live, {
			status: "failed",
			completedAt: new Date().toISOString(),
			pendingUiRequest: undefined,
			terminalDiagnostic: error?.message,
		});
		this.completeManagedInstance(live, {
			state: "FAILED",
			errorClassification: error?.name ?? "UnexpectedProcessExit",
			errorMessage: error?.message ?? "RPC child exited unexpectedly",
		});
		this.clearBindings(live);
		live.resources.rpcProcess = undefined;
		if (live.resources.radiusPiId) {
			try {
				await this.presence.disconnectPi(live.record);
				this.updateRecord(live, { radiusPiId: undefined });
			} catch (error) {
				console.error(`Failed to disconnect Radius Pi ${live.record.id}: ${String(error)}`);
			}
		}
		this.liveInstances.delete(live.record.id);
	}

	private getRpcProcess(live: LiveInstance): SupervisorRpcProcess | undefined {
		return live.resources.rpcProcess;
	}

	private async syncInstanceRecord(live: LiveInstance): Promise<void> {
		const rpcProcess = this.getRpcProcess(live);
		if (!rpcProcess) {
			this.updateRecord(live, {});
			return;
		}
		const response = await rpcProcess.send({ type: "get_state" });
		if (!isGetStateSuccess(response)) {
			this.updateRecord(live, {});
			return;
		}
		this.updateRecord(live, {
			sessionId: response.data.sessionId,
			sessionFile: response.data.sessionFile,
		});
	}

	private async cleanupAcquiredResources(live: LiveInstance): Promise<CleanupOutcome> {
		const rpcProcess = live.resources.rpcProcess;
		const diagnostics: string[] = [];
		let termination: RpcDisposeResult | undefined;
		this.releaseTurnLease(live);
		live.pendingUiRequest = undefined;
		live.record = { ...live.record, pendingUiRequest: undefined };
		this.clearBindings(live);
		live.resources.sessionId = undefined;
		if (rpcProcess) {
			live.resources.rpcProcess = undefined;
			try {
				termination = await rpcProcess.dispose();
			} catch (error) {
				diagnostics.push(`RPC disposal failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		if (live.resources.radiusPiId) {
			try {
				await withDeadline(
					this.presence.disconnectPi(live.record),
					PRESENCE_DISCONNECT_DEADLINE_MS,
					"Presence disconnect deadline expired",
				);
				live.resources.radiusPiId = undefined;
				live.record = {
					...live.record,
					radiusPiId: undefined,
					lastSeenAt: new Date().toISOString(),
				};
			} catch (error) {
				diagnostics.push(`Presence disconnect failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		return {
			termination,
			diagnostic: diagnostics.length > 0 ? diagnostics.join("; ").slice(0, 4096) : undefined,
		};
	}

	private async failSpawn(live: LiveInstance, error: unknown): Promise<never> {
		this.setStatus(live, "error");
		try {
			await this.cleanupAcquiredResources(live);
		} finally {
			this.updateRecord(live, { status: "failed", completedAt: new Date().toISOString() });
			this.completeManagedInstance(live, {
				state: "FAILED",
				errorClassification: error instanceof Error ? error.name : "Error",
				errorMessage: error instanceof Error ? error.message : String(error),
			});
			this.liveInstances.delete(live.record.id);
		}
		throw error;
	}

	updateInstance(instance: InstanceRecord): void {
		const live = this.liveInstances.get(instance.id);
		if (live) {
			live.record = instance;
			live.resources.radiusPiId = instance.radiusPiId;
			live.resources.sessionId = instance.sessionId;
			live.pendingUiRequest = instance.pendingUiRequest;
		}
		upsertInstance(instance);
	}

	private async handleRpcForLive(live: LiveInstance, command: RpcCommand, ownerId: string): Promise<RpcResponse> {
		const rpcProcess = this.getRpcProcess(live);
		if (!rpcProcess) throw new Error(`RPC process is unavailable for ${live.record.id}`);
		if (live.record.workspaceReceipt?.access === "read-only" && !isWorkspaceReadOnlyCommand(command)) {
			throw new Error(`RPC command ${command.type} is unavailable in a read-only workspace session`);
		}
		if (command.type !== "prompt") {
			const response = await rpcProcess.send(command);
			if (shouldRefreshSessionMetadata(command)) await this.syncInstanceRecord(live);
			return response;
		}
		const sessionId = live.record.sessionId;
		if (!sessionId) throw new Error(`Cannot acquire a turn lease before session identity is resolved`);
		const generation = ++live.nextTurnGeneration;
		const token = await this.turnLeases.acquire(sessionId, ownerId, generation, this.turnLeaseTimeoutMs);
		live.turnLease = token;
		try {
			const response = await rpcProcess.send(command);
			if (!response.success) this.releaseTurnLease(live, token);
			return response;
		} catch (error) {
			this.releaseTurnLease(live, token);
			throw error;
		}
	}

	openRpcStream(
		instanceId: string,
		onEvent: (event: AgentSessionEvent) => void,
		onUiRequest: (request: RpcExtensionUIRequest) => void,
		options: { mode?: RpcStreamMode; ownerId?: string } = {},
	):
		| {
				attachment: RpcStreamAttachmentInfo;
				replay: RpcStreamReplay;
				handleRpc(command: RpcCommand): Promise<RpcResponse>;
				handleUiResponse(response: RpcExtensionUIResponse): void;
				close(): void;
		  }
		| undefined {
		const live = this.liveInstances.get(instanceId);
		const rpcProcess = live ? this.getRpcProcess(live) : undefined;
		if (!live || !rpcProcess || live.subscribers.size >= this.maxSubscribersPerInstance) return undefined;
		const mode = options.mode ?? "interactive";
		if (mode !== "interactive" && mode !== "read-only") throw new Error(`Unsupported RPC stream mode: ${mode}`);
		let owner: InteractiveOwner | undefined;
		if (mode === "interactive") {
			if (live.interactiveOwner) throw new InteractiveOwnerAttachedError(instanceId, live.interactiveOwner.ownerId);
			const ownerId = options.ownerId ?? `stream:${randomUUID()}`;
			if (!ownerId || ownerId.length > 512) throw new Error("ownerId must contain 1 to 512 characters");
			const lifecycleHandle = this.lifecycleHandles.get(instanceId);
			const lifecycleAttachment = lifecycleHandle ? this.lifecycle.attach(lifecycleHandle, ownerId) : undefined;
			owner = {
				ownerId,
				ownerGeneration: lifecycleAttachment?.ownerGeneration ?? ++live.nextOwnerGeneration,
				lifecycleAttachment,
				onUiRequest,
			};
			live.interactiveOwner = owner;
			if (live.record.status === "waiting-input") this.setStatus(live, "online");
		}
		live.subscribers.add(onEvent);
		const attachment: RpcStreamAttachmentInfo = {
			mode,
			ownerId: owner?.ownerId,
			ownerGeneration: owner?.ownerGeneration,
		};
		const replay: RpcStreamReplay = {
			events: live.eventTail.map(
				(entry) => cloneBoundedJson(entry.event, MAX_REPLAY_EVENT_BYTES)?.value ?? entry.event,
			),
			pendingUiRequest: live.pendingUiRequest
				? cloneBoundedJson(live.pendingUiRequest, MAX_REPLAY_EVENT_BYTES)?.value
				: undefined,
		};
		return {
			attachment,
			replay,
			handleRpc: async (command) => {
				if (mode === "read-only" && !READ_ONLY_RPC_COMMANDS.has(command.type)) {
					throw new Error(`RPC command ${command.type} requires the interactive owner`);
				}
				if (mode === "interactive" && owner && live.interactiveOwner !== owner) {
					throw new Error("Stale interactive RPC attachment");
				}
				return await this.handleRpcForLive(live, command, owner?.ownerId ?? `observer:${randomUUID()}`);
			},
			handleUiResponse: (response) => {
				if (!owner || live.interactiveOwner !== owner) throw new Error("Stale or read-only RPC attachment");
				if (!live.pendingUiRequest || live.pendingUiRequest.id !== response.id) {
					throw new Error(`UI response does not match the pending request: ${response.id}`);
				}
				live.pendingUiRequest = undefined;
				this.updateRecord(live, {
					pendingUiRequest: undefined,
					status: "online",
					currentActivity: "Idle",
					activityUpdatedAt: new Date().toISOString(),
				});
				const lifecycleHandle = this.lifecycleHandles.get(live.record.id);
				if (lifecycleHandle) this.lifecycle.setWaitingInput(lifecycleHandle, false);
				rpcProcess.handleUiResponse(response);
			},
			close: () => {
				live.subscribers.delete(onEvent);
				if (owner && live.interactiveOwner === owner) {
					live.interactiveOwner = undefined;
					if (owner.lifecycleAttachment) this.lifecycle.detach(owner.lifecycleAttachment);
					if (live.pendingUiRequest && live.record.status === "online") this.setStatus(live, "waiting-input");
				}
			},
		};
	}

	getLiveInstance(instanceId: string): InstanceRecord | undefined {
		const live = this.liveInstances.get(instanceId);
		return live ? cloneInstance(live.record) : undefined;
	}

	listLiveInstances(): InstanceRecord[] {
		return [...this.liveInstances.values()].map((live) => cloneInstance(live.record));
	}

	getLifecycleStatus(instanceId: string): MaestroStatus | undefined {
		const handle = this.lifecycleHandles.get(instanceId);
		if (!handle) return undefined;
		const status = this.lifecycle.status(handle);
		if (status.state === "UNKNOWN") this.lifecycleHandles.delete(instanceId);
		return status;
	}

	getLifecycleResult(instanceId: string): MaestroResult | undefined {
		const handle = this.lifecycleHandles.get(instanceId);
		return handle ? this.lifecycle.result(handle) : undefined;
	}

	async recoverAfterRestart(): Promise<void> {
		const recoveredAt = new Date().toISOString();
		const recovered: InstanceRecord[] = [];
		for (const instance of loadInstances()) {
			const wasLive =
				instance.status === "online" || instance.status === "starting" || instance.status === "waiting-input";
			if (!wasLive) {
				try {
					recovered.push(this.enqueuePersistedCompletion(instance));
				} catch (error) {
					recovered.push({
						...instance,
						terminalDiagnostic:
							`COMPLETION_RECOVERY_FAILED: ${error instanceof Error ? error.message : String(error)}`.slice(
								0,
								4096,
							),
					});
				}
				continue;
			}
			let rpcProcess: SupervisorRpcProcess | undefined;
			let adoptedLive: LiveInstance | undefined;
			try {
				if (
					!instance.workspaceReceipt ||
					!this.verifyWorkspaceReceipt(instance.workspaceReceipt) ||
					!instance.processIdentity ||
					!instance.sessionId ||
					!this.inspectProcessIdentity ||
					!this.reconnectRpcProcess ||
					this.liveInstances.size >= this.maxLiveInstances
				) {
					throw new Error("verified reconnect prerequisites are unavailable");
				}
				const observedIdentity = await this.inspectProcessIdentity(instance.processIdentity.pid);
				if (!verifyProcessIdentity(instance.processIdentity, observedIdentity)) {
					throw new Error("process identity receipt mismatch");
				}
				rpcProcess = await this.reconnectRpcProcess(instance);
				if (!rpcProcess?.detach) throw new Error("reconnected transport cannot detach non-destructively");
				if (!verifyProcessIdentity(instance.processIdentity, rpcProcess.processIdentity)) {
					throw new Error("reconnected transport identity mismatch");
				}
				const state = await rpcProcess.send({ type: "get_state" });
				if (
					!isGetStateSuccess(state) ||
					state.data.sessionId !== instance.sessionId ||
					(instance.sessionFile !== undefined && state.data.sessionFile !== instance.sessionFile)
				) {
					throw new Error("session identity receipt mismatch");
				}
				const live = createLiveInstance(
					{
						...instance,
						status: instance.pendingUiRequest
							? "waiting-input"
							: instance.status === "starting"
								? "online"
								: instance.status,
						lastSeenAt: recoveredAt,
					},
					{ rpcProcess, radiusPiId: instance.radiusPiId, sessionId: instance.sessionId },
				);
				adoptedLive = live;
				this.liveInstances.set(instance.id, live);
				this.bindRpcProcess(live, rpcProcess);
				const handle = this.lifecycle.launch(
					{
						kind: "full-session",
						goal: instance.label?.trim() || "Recover an Aizen session",
						role: "aizen",
						cwd: instance.cwd,
						workspaceAccess: instance.workspaceReceipt.access,
						parentInstanceId: instance.parentInstanceId,
						parentSessionId: instance.parentSessionId,
						metadata: { recovered: true, label: instance.label },
					},
					{ instanceId: instance.id },
				);
				this.lifecycleHandles.set(instance.id, handle);
				await this.waitForLifecycleStart(handle);
				void this.deliverCompletions(live.record.id);
				const registered = await this.presence.registerPi(live.record);
				live.record = { ...live.record, radiusPiId: registered.radiusPiId };
				live.resources.radiusPiId = registered.radiusPiId;
				recovered.push(live.record);
			} catch (error) {
				if (adoptedLive) {
					this.clearBindings(adoptedLive);
					this.liveInstances.delete(instance.id);
					this.lifecycleHandles.delete(instance.id);
				}
				await rpcProcess?.detach?.().catch(() => undefined);
				await this.presence.disconnectPi(instance).catch(() => undefined);
				const terminalDiagnostic =
					`RESTART_RECONNECT_UNVERIFIED: ${error instanceof Error ? error.message : String(error)}`.slice(0, 4096);
				const interrupted: InstanceRecord = {
					...instance,
					status: "stopped",
					lastSeenAt: recoveredAt,
					completedAt: recoveredAt,
					pendingUiRequest: undefined,
					terminalDiagnostic,
					terminalState: "INTERRUPTED",
					terminalSummary: terminalDiagnostic,
					terminalResultHash: createTerminalResultHash(instance, "INTERRUPTED", terminalDiagnostic, recoveredAt),
				};
				try {
					recovered.push(this.enqueuePersistedCompletion(interrupted));
				} catch (completionError) {
					recovered.push({
						...interrupted,
						terminalDiagnostic:
							`${terminalDiagnostic}; COMPLETION_RECOVERY_FAILED: ${completionError instanceof Error ? completionError.message : String(completionError)}`.slice(
								0,
								4096,
							),
					});
				}
			}
		}
		saveInstances(recovered);
	}

	listInstances(): InstanceRecord[] {
		const instances = new Map(loadInstances().map((record) => [record.id, cloneInstance(record)]));
		for (const live of this.liveInstances.values()) instances.set(live.record.id, cloneInstance(live.record));
		return [...instances.values()];
	}

	getInstance(instanceId: string): InstanceRecord | undefined {
		const live = this.liveInstances.get(instanceId);
		if (live) {
			return cloneInstance(live.record);
		}
		const stored = getInstance(instanceId);
		return stored ? cloneInstance(stored) : undefined;
	}

	async spawnInstance(options: {
		cwd: string;
		workspaceAccess?: WorkspaceAccessMode;
		label?: string;
		parentInstanceId?: string;
		parentSessionId?: string;
	}): Promise<InstanceRecord> {
		this.cleanupLifecycleHandles();
		const request: MaestroLaunchRequest = {
			kind: "full-session",
			goal: options.label?.trim() || "Run an Aizen session",
			role: "aizen",
			cwd: options.cwd,
			workspaceAccess: options.workspaceAccess ?? "read-only",
			parentInstanceId: options.parentInstanceId,
			parentSessionId: options.parentSessionId,
			metadata: options.label ? { label: options.label } : undefined,
		};
		const handle = this.lifecycle.launch(request);
		this.lifecycleHandles.set(handle.instanceId, handle);
		await this.waitForLifecycleStart(handle);
		const instance = this.getInstance(handle.instanceId);
		if (!instance) throw new Error(`Maestro lifecycle started without instance state: ${handle.instanceId}`);
		return instance;
	}

	private async spawnManagedInstance(options: {
		instanceId: string;
		cwd: string;
		workspaceAccess: WorkspaceAccessMode;
		label?: string;
		parentInstanceId?: string;
		parentSessionId?: string;
	}): Promise<InstanceRecord> {
		if (this.liveInstances.size >= this.maxLiveInstances) throw new Error("Maestro live instance limit reached");
		const workspaceAccess = options.workspaceAccess;
		if (workspaceAccess !== "read-only" && workspaceAccess !== "write") {
			throw new Error("workspaceAccess must be read-only or write");
		}
		const id = options.instanceId;
		const workspaceReceipt = this.inspectWorkspace(options.cwd, workspaceAccess, id);
		assertWorkspaceAdmission(workspaceReceipt, this.listLiveInstances(), options.parentInstanceId);
		const now = new Date().toISOString();
		const live = createLiveInstance({
			id,
			status: "starting",
			cwd: workspaceReceipt.selectedPath,
			createdAt: now,
			lastSeenAt: now,
			label: options.label,
			parentInstanceId: options.parentInstanceId,
			parentSessionId: options.parentSessionId,
			workspaceReceipt,
		});
		this.liveInstances.set(live.record.id, live);
		upsertInstance(live.record);

		try {
			const rpcProcess = this.createRpcProcess({
				cwd: workspaceReceipt.selectedPath,
				workspaceAccess: workspaceReceipt.access,
			});
			this.bindRpcProcess(live, rpcProcess);
			if (rpcProcess.processIdentity) this.updateRecord(live, { processIdentity: rpcProcess.processIdentity });
			await this.syncInstanceRecord(live);
			const registeredRecord = await this.presence.registerPi(live.record);
			this.updateRecord(live, { radiusPiId: registeredRecord.radiusPiId });
			this.setStatus(live, live.pendingUiRequest ? "waiting-input" : "online");
			void this.deliverCompletions(live.record.id);
			return cloneInstance(live.record);
		} catch (error) {
			return await this.failSpawn(live, error);
		}
	}

	async stopInstance(instanceId: string): Promise<InstanceRecord | undefined> {
		const handle = this.lifecycleHandles.get(instanceId);
		if (handle) {
			await this.lifecycle.stop(handle);
			return this.getInstance(instanceId);
		}
		return await this.stopManagedInstance(instanceId);
	}

	private async stopManagedInstance(instanceId: string): Promise<InstanceRecord | undefined> {
		const live = this.liveInstances.get(instanceId);
		if (!live) {
			return undefined;
		}

		this.setStatus(live, "stopping");
		const cleanup = await this.cleanupAcquiredResources(live);
		const completedAt = new Date().toISOString();
		const terminationFailed = cleanup.termination !== undefined && !cleanup.termination.exited;
		live.record = {
			...live.record,
			status: cleanup.diagnostic || terminationFailed ? "failed" : "cancelled",
			lastSeenAt: completedAt,
			completedAt,
			terminationOutcome: cleanup.termination,
			terminalDiagnostic:
				cleanup.diagnostic ?? (terminationFailed ? "RPC process did not exit after forced termination" : undefined),
		};
		this.liveInstances.delete(instanceId);
		upsertInstance(live.record);
		this.completeManagedInstance(live, {
			state: live.record.status === "cancelled" ? "CANCELLED" : "FAILED",
			summary: live.record.status === "cancelled" ? "Session stopped by Maestro" : undefined,
			errorClassification: live.record.status === "failed" ? "TerminationFailure" : undefined,
			errorMessage: live.record.status === "failed" ? live.record.terminalDiagnostic : undefined,
		});
		return cloneInstance(live.record);
	}

	async cancelInstance(instanceId: string, commandId?: string): Promise<RpcCancellationResult> {
		const handle = this.lifecycleHandles.get(instanceId);
		if (!handle) return await this.cancelManagedInstance(instanceId, commandId);
		const result = await this.lifecycle.cancel(handle, "Cancelled by Maestro", commandId);
		const resultKey = cancellationResultKey(instanceId, commandId);
		const cancellation = this.lastCancellationResults.get(resultKey);
		this.lastCancellationResults.delete(resultKey);
		return (
			cancellation ?? {
				commandId: commandId ?? `instance:${instanceId}`,
				requested: result.accepted,
				accepted: result.accepted,
				completed: result.accepted || result.alreadyTerminal,
				alreadyTerminal: result.alreadyTerminal,
				unsupported: result.unsupported,
				unknown: result.unknownHandle,
			}
		);
	}

	private async cancelManagedInstance(instanceId: string, commandId?: string): Promise<RpcCancellationResult> {
		if (commandId !== undefined && (!commandId || commandId.length > 512)) {
			throw new Error("commandId must contain 1 to 512 characters");
		}
		const live = this.liveInstances.get(instanceId);
		const rpcProcess = live ? this.getRpcProcess(live) : undefined;
		const cancellationId = commandId ?? `instance:${instanceId}`;
		if (!live || !rpcProcess) {
			return {
				commandId: cancellationId,
				requested: false,
				accepted: false,
				completed: false,
				unsupported: false,
				unknown: true,
			};
		}
		if (commandId) {
			return rpcProcess.cancel
				? await rpcProcess.cancel(commandId)
				: {
						commandId,
						requested: false,
						accepted: false,
						completed: false,
						unsupported: true,
						unknown: false,
					};
		}
		try {
			const response = await rpcProcess.send({ type: "abort" });
			const completed = response.success === true && response.command === "abort";
			return {
				commandId: cancellationId,
				requested: true,
				accepted: completed,
				completed,
				unsupported: false,
				unknown: false,
			};
		} catch {
			return {
				commandId: cancellationId,
				requested: true,
				accepted: false,
				completed: false,
				unsupported: false,
				unknown: false,
			};
		}
	}

	async handleRpc(
		instanceId: string,
		command: RpcCommand,
		owner: { ownerId?: string; ownerGeneration?: number } = {},
	): Promise<RpcResponse | undefined> {
		const live = this.liveInstances.get(instanceId);
		const rpcProcess = live ? this.getRpcProcess(live) : undefined;
		if (!live || !rpcProcess) return undefined;
		if (live.record.workspaceReceipt?.access === "read-only" && !isWorkspaceReadOnlyCommand(command)) {
			throw new Error(`RPC command ${command.type} is unavailable in a read-only workspace session`);
		}
		if (!READ_ONLY_RPC_COMMANDS.has(command.type)) {
			if (!live.interactiveOwner) {
				throw new Error(`RPC command ${command.type} requires an attached interactive approval owner`);
			}
			if (
				owner.ownerId !== live.interactiveOwner.ownerId ||
				owner.ownerGeneration !== live.interactiveOwner.ownerGeneration
			) {
				throw new Error(`RPC command ${command.type} requires the current interactive owner capability`);
			}
		}
		return await this.handleRpcForLive(live, command, owner.ownerId ?? `rpc:${command.id ?? randomUUID()}`);
	}

	async shutdown(): Promise<void> {
		await Promise.all([...this.liveInstances.keys()].map(async (instanceId) => await this.stopInstance(instanceId)));
	}
}

export const supervisor = new OrchestratorSupervisor();

radiusPresence.setCoordinator({
	getLiveInstance(instanceId) {
		return supervisor.getLiveInstance(instanceId);
	},
	listLiveInstances() {
		return supervisor.listLiveInstances();
	},
	updateInstance(instance) {
		supervisor.updateInstance(instance);
	},
});
