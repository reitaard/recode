import type { RpcExtensionUIRequest } from "@reitaard/recode-coding-agent";

export type InstanceStatus =
	| "starting"
	| "online"
	| "waiting-input"
	| "stopping"
	| "stopped"
	| "error"
	| "succeeded"
	| "failed"
	| "cancelled";

export interface MachineRecord {
	id: string;
	createdAt: string;
	lastSeenAt?: string;
	label?: string;
}

export interface RadiusRegistration {
	heartbeatIntervalMs: number;
	expiresInMs: number;
}

export interface ProcessIdentityRecord {
	pid: number;
	startReceipt: string;
}

export type MaestroServiceState = "starting" | "ready" | "degraded" | "draining" | "stopped" | "crashed";
export type MaestroSupervisionMode = "manual" | "systemd" | "windows-task";
export type MaestroServiceExitClassification = "planned-stop" | "planned-restart" | "process-crash";
export type MaestroAdapterState = "disabled" | "initializing" | "ready" | "degraded" | "error";

export interface MaestroServiceOwnerReceipt {
	schemaVersion: 1;
	serviceId: string;
	processIdentity: ProcessIdentityRecord;
	startedAt: string;
	supervisionMode: MaestroSupervisionMode;
	endpoint: string;
}

export interface MaestroRestartDiagnostic {
	observedAt: string;
	classification: MaestroServiceExitClassification;
	previousServiceId?: string;
	detail: string;
}

export interface MaestroServiceHealth {
	schemaVersion: 1;
	serviceId: string;
	state: MaestroServiceState;
	ready: boolean;
	acceptingRequests: boolean;
	supervisionMode: MaestroSupervisionMode;
	processIdentity: ProcessIdentityRecord;
	startedAt: string;
	updatedAt: string;
	endpoint: string;
	liveInstances: number;
	waitingInput: number;
	adapters: {
		radius: MaestroAdapterState;
	};
	restartLoopDetected: boolean;
	restartDiagnostics: MaestroRestartDiagnostic[];
	lastExitClassification?: MaestroServiceExitClassification;
	diagnostic?: string;
}

export interface TerminationOutcome {
	graceful: boolean;
	forced: boolean;
	exited: boolean;
}

export type WorkspaceAccessMode = "read-only" | "write";

export interface WorkspaceOwnershipReceipt {
	schemaVersion: 1;
	ownerInstanceId: string;
	access: WorkspaceAccessMode;
	selectedPath: string;
	worktreeRoot: string;
	gitCommonDir?: string;
	worktreeIdentity: string;
	branch?: string;
	selectedAt: string;
	managed: false;
}

export type CompletionTerminalState = "SUCCEEDED" | "FAILED" | "INTERRUPTED" | "CANCELLED";
export type CompletionDeliveryState = "pending" | "claimed" | "acknowledged";

export interface CompletionRecord {
	id: string;
	parentInstanceId?: string;
	parentSessionId?: string;
	childInstanceId: string;
	childSessionId?: string;
	terminalState: CompletionTerminalState;
	summary?: string;
	resultHash: string;
	completedAt: string;
	createdAt: string;
	deliveryState: CompletionDeliveryState;
	claimOwner?: string;
	claimGeneration: number;
	claimedAt?: string;
	acknowledgedAt?: string;
}

export interface InstanceRecord {
	id: string;
	status: InstanceStatus;
	cwd: string;
	createdAt: string;
	lastSeenAt?: string;
	completedAt?: string;
	label?: string;
	parentInstanceId?: string;
	parentSessionId?: string;
	workspaceReceipt?: WorkspaceOwnershipReceipt;
	sessionId?: string;
	sessionFile?: string;
	radiusPiId?: string;
	processIdentity?: ProcessIdentityRecord;
	terminationOutcome?: TerminationOutcome;
	terminalDiagnostic?: string;
	terminalState?: CompletionTerminalState;
	terminalSummary?: string;
	terminalResultHash?: string;
	completionQueuedAt?: string;
	currentActivity?: string;
	activityUpdatedAt?: string;
	latestOutput?: string;
	pendingUiRequest?: RpcExtensionUIRequest;
}
