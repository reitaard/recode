export const MAESTRO_LIFECYCLE_CONTRACT_VERSION = 1 as const;

export const MAESTRO_LIFECYCLE_STATES = [
	"PENDING",
	"STARTING",
	"RUNNING",
	"WAITING_INPUT",
	"SUCCEEDED",
	"FAILED",
	"INTERRUPTED",
	"CANCEL_REQUESTED",
	"CANCELLED",
	"UNKNOWN",
] as const;

export type MaestroLifecycleState = (typeof MAESTRO_LIFECYCLE_STATES)[number];
export type MaestroTerminalState = "SUCCEEDED" | "FAILED" | "INTERRUPTED" | "CANCELLED";
export type MaestroLifecycleKind = "worker" | "full-session";

export interface MaestroLaunchRequest {
	kind: MaestroLifecycleKind;
	goal: string;
	context?: string;
	role: string;
	cwd: string;
	workspaceAccess: "read-only" | "write";
	parentInstanceId?: string;
	parentSessionId?: string;
	correlationId?: string;
	metadata?: Readonly<Record<string, unknown>>;
}

export interface MaestroHandle {
	contractVersion: typeof MAESTRO_LIFECYCLE_CONTRACT_VERSION;
	instanceId: string;
	kind: MaestroLifecycleKind;
	parentInstanceId?: string;
	parentSessionId?: string;
	correlationId?: string;
	createdAt: string;
	capability: string;
}

export interface MaestroProcessIdentity {
	pid: number;
	startReceipt: string;
}

export interface MaestroRuntimeIdentity {
	cwd: string;
	worktreeIdentity?: string;
	process?: Readonly<MaestroProcessIdentity>;
	sessionId?: string;
	sessionFile?: string;
}

export interface MaestroProgressSnapshot {
	message?: string;
	outputTail?: string;
}

export interface MaestroStatus {
	handle: Readonly<MaestroHandle>;
	state: MaestroLifecycleState;
	updatedAt: string;
	startedAt?: string;
	completedAt?: string;
	ownerGeneration: number;
	runtime: Readonly<MaestroRuntimeIdentity>;
	progress?: Readonly<MaestroProgressSnapshot>;
	diagnostic?: string;
}

export interface MaestroTerminalStatus {
	handle: Readonly<MaestroHandle>;
	state: MaestroLifecycleState;
	completed: boolean;
	timedOut: boolean;
	diagnostic?: string;
}

export interface MaestroCancelResult {
	accepted: boolean;
	alreadyTerminal: boolean;
	unknownHandle: boolean;
	unsupported: boolean;
	staleOwner: boolean;
	state: MaestroLifecycleState;
}

export interface MaestroResult {
	handle: Readonly<MaestroHandle>;
	terminalState: MaestroLifecycleState;
	ready: boolean;
	summary?: string;
	startedAt?: string;
	completedAt?: string;
	errorClassification?: string;
	errorMessage?: string;
	resultHash?: string;
	handoffState?: "not-required" | "queued" | "failed";
	handoffDiagnostic?: string;
}

export interface MaestroReconnectResult {
	connected: boolean;
	state: MaestroLifecycleState;
	diagnostic?: string;
}

export interface MaestroAttachment {
	instanceId: string;
	ownerId: string;
	ownerGeneration: number;
	capability: string;
}

export interface MaestroDetachResult {
	detached: boolean;
	stale: boolean;
	state: MaestroLifecycleState;
}

export interface MaestroLifecycleEvent {
	instanceId: string;
	state: MaestroLifecycleState;
	updatedAt: string;
	progress?: Readonly<MaestroProgressSnapshot>;
}

export class MaestroLifecycleError extends Error {
	readonly code:
		| "DUPLICATE_CORRELATION"
		| "INVALID_HANDLE"
		| "INVALID_REQUEST"
		| "INVALID_TRANSITION"
		| "OWNER_ATTACHED"
		| "STALE_ATTACHMENT";

	constructor(code: MaestroLifecycleError["code"], message: string) {
		super(message);
		this.name = "MaestroLifecycleError";
		this.code = code;
	}
}

const TERMINAL_STATES: ReadonlySet<MaestroLifecycleState> = new Set([
	"SUCCEEDED",
	"FAILED",
	"INTERRUPTED",
	"CANCELLED",
]);

const LEGAL_TRANSITIONS: Readonly<
	Record<Exclude<MaestroLifecycleState, "UNKNOWN">, ReadonlySet<MaestroLifecycleState>>
> = {
	PENDING: new Set(["STARTING", "CANCEL_REQUESTED", "FAILED"]),
	STARTING: new Set(["RUNNING", "WAITING_INPUT", "CANCEL_REQUESTED", "FAILED", "INTERRUPTED"]),
	RUNNING: new Set(["WAITING_INPUT", "CANCEL_REQUESTED", "SUCCEEDED", "FAILED", "INTERRUPTED"]),
	WAITING_INPUT: new Set(["RUNNING", "CANCEL_REQUESTED", "SUCCEEDED", "FAILED", "INTERRUPTED"]),
	CANCEL_REQUESTED: new Set(["SUCCEEDED", "CANCELLED", "FAILED", "INTERRUPTED"]),
	SUCCEEDED: new Set(),
	FAILED: new Set(),
	INTERRUPTED: new Set(),
	CANCELLED: new Set(),
};

export function isMaestroTerminalState(state: MaestroLifecycleState): state is MaestroTerminalState {
	return TERMINAL_STATES.has(state);
}

export function isLegalMaestroTransition(from: MaestroLifecycleState, to: MaestroLifecycleState): boolean {
	if (from === "UNKNOWN" || to === "UNKNOWN") return false;
	return LEGAL_TRANSITIONS[from].has(to);
}
