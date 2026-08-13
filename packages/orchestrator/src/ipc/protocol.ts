import type {
	AgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@reitaard/recode-coding-agent";
import type { MaestroLifecycleState } from "../lifecycle-contract.ts";
import type { RpcCancellationResult } from "../rpc-process.ts";
import type {
	InstanceStatus,
	MaestroServiceExitClassification,
	MaestroServiceHealth,
	TerminationOutcome,
	WorkspaceAccessMode,
} from "../types.ts";

export interface SpawnRequest {
	type: "spawn";
	cwd: string;
	workspaceAccess: WorkspaceAccessMode;
	label?: string;
	parentInstanceId?: string;
	parentSessionId?: string;
	provider?: string;
	model?: string;
}

export interface ListRequest {
	type: "list";
}

export interface HealthRequest {
	type: "health";
}

export interface ShutdownRequest {
	type: "shutdown";
	reason: Extract<MaestroServiceExitClassification, "planned-stop" | "planned-restart">;
}

export interface StopRequest {
	type: "stop";
	instanceId: string;
}

export interface CancelRequest {
	type: "cancel";
	instanceId: string;
	commandId?: string;
}

export interface StatusRequest {
	type: "status";
	instanceId: string;
}

export interface RpcRequest {
	type: "rpc";
	instanceId: string;
	command: RpcCommand;
	ownerId?: string;
	ownerGeneration?: number;
}

export interface RpcStreamRequest {
	type: "rpc_stream";
	instanceId: string;
	mode?: "interactive" | "read-only";
	ownerId?: string;
}

export interface RequestMap {
	spawn: SpawnRequest;
	list: ListRequest;
	health: HealthRequest;
	shutdown: ShutdownRequest;
	stop: StopRequest;
	cancel: CancelRequest;
	status: StatusRequest;
	rpc: RpcRequest;
	rpc_stream: RpcStreamRequest;
}

export type OrchestratorRequest = RequestMap[keyof RequestMap];
export type AuthenticatedOrchestratorRequest = OrchestratorRequest & { authToken?: string };

export interface InstanceSummary {
	id: string;
	status: InstanceStatus;
	lifecycleState: MaestroLifecycleState;
	stateConsistent: boolean;
	stateDiagnostic?: string;
	cwd: string;
	label?: string;
	createdAt: string;
	lastSeenAt?: string;
	parentInstanceId?: string;
	parentSessionId?: string;
	workspace?: {
		access: WorkspaceAccessMode;
		worktreeRoot: string;
		worktreeIdentity: string;
		branch?: string;
	};
	sessionId?: string;
	sessionFile?: string;
	radiusPiId?: string;
	completedAt?: string;
	terminationOutcome?: TerminationOutcome;
	terminalDiagnostic?: string;
	currentActivity?: string;
	activityUpdatedAt?: string;
	latestOutput?: string;
	pendingInput: boolean;
}

export interface ResponseBase {
	ok: boolean;
	error?: string;
}

export interface SpawnResponse extends ResponseBase {
	type: "spawn_result";
	instance?: InstanceSummary;
}

export interface ListResponse extends ResponseBase {
	type: "list_result";
	instances?: InstanceSummary[];
}

export interface HealthResponse extends ResponseBase {
	type: "health_result";
	health?: MaestroServiceHealth;
}

export interface ShutdownResponse extends ResponseBase {
	type: "shutdown_result";
	reason?: Extract<MaestroServiceExitClassification, "planned-stop" | "planned-restart">;
}

export interface StopResponse extends ResponseBase {
	type: "stop_result";
	instanceId?: string;
}

export interface StatusResponse extends ResponseBase {
	type: "status_result";
	instance?: InstanceSummary;
}

export interface CancelResponse extends ResponseBase {
	type: "cancel_result";
	cancellation?: RpcCancellationResult;
}

export interface RpcBridgeResponse extends ResponseBase {
	type: "rpc_result";
	response: RpcResponse;
}

export interface RpcReadyResponse extends ResponseBase {
	type: "rpc_ready";
	instance?: InstanceSummary;
	attachment?: {
		mode: "interactive" | "read-only";
		ownerId?: string;
		ownerGeneration?: number;
	};
	replay?: {
		events: AgentSessionEvent[];
		pendingUiRequest?: RpcExtensionUIRequest;
	};
}

export interface ErrorResponse extends ResponseBase {
	type: "error";
	ok: false;
	error: string;
}

export interface ResponseMap {
	spawn: SpawnResponse;
	list: ListResponse;
	health: HealthResponse;
	shutdown: ShutdownResponse;
	stop: StopResponse;
	cancel: CancelResponse;
	status: StatusResponse;
	rpc: RpcBridgeResponse;
	rpc_stream: RpcReadyResponse;
}

export type OrchestratorResponse = ResponseMap[keyof ResponseMap] | ErrorResponse;
export type RpcClientMessage = RpcCommand | RpcExtensionUIResponse;
export type RpcServerMessage =
	| RpcReadyResponse
	| RpcResponse
	| AgentSessionEvent
	| RpcExtensionUIRequest
	| ErrorResponse;
export type ProtocolMessage = OrchestratorRequest | OrchestratorResponse | RpcClientMessage | RpcServerMessage;

export type ResponseFor<T extends OrchestratorRequest> = T extends { type: infer K }
	? K extends keyof ResponseMap
		? ResponseMap[K] | ErrorResponse
		: ErrorResponse
	: ErrorResponse;

export function encodeMessage(message: ProtocolMessage | AuthenticatedOrchestratorRequest): string {
	return `${JSON.stringify(message)}\n`;
}

export function parseRequestLine(line: string): AuthenticatedOrchestratorRequest {
	const value = JSON.parse(line) as AuthenticatedOrchestratorRequest;
	return value;
}

export function parseResponseLine(line: string): OrchestratorResponse {
	const value = JSON.parse(line) as OrchestratorResponse;
	return value;
}
