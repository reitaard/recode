import type {
	AgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@reitaard/recode-coding-agent";
import type {
	CancelRequest,
	CancelResponse,
	ErrorResponse,
	HealthRequest,
	HealthResponse,
	InstanceSummary,
	ListRequest,
	ListResponse,
	OrchestratorRequest,
	OrchestratorResponse,
	RpcBridgeResponse,
	RpcReadyResponse,
	RpcRequest,
	RpcStreamRequest,
	ShutdownRequest,
	ShutdownResponse,
	SpawnRequest,
	SpawnResponse,
	StatusRequest,
	StatusResponse,
	StopRequest,
	StopResponse,
} from "./ipc/protocol.ts";
import { projectMaestroState } from "./state-projection.ts";
import { supervisor } from "./supervisor.ts";
import type { InstanceRecord } from "./types.ts";

function toInstanceSummary(instance: InstanceRecord): InstanceSummary {
	const lifecycleStatus = supervisor.getLifecycleStatus(instance.id);
	const projection = projectMaestroState(instance, lifecycleStatus?.state);
	return {
		id: instance.id,
		status: instance.status,
		lifecycleState: projection.state,
		stateConsistent: projection.consistent,
		stateDiagnostic: projection.diagnostic,
		cwd: instance.cwd,
		label: instance.label,
		createdAt: instance.createdAt,
		lastSeenAt: instance.lastSeenAt,
		parentInstanceId: instance.parentInstanceId,
		parentSessionId: instance.parentSessionId,
		workspace: instance.workspaceReceipt
			? {
					access: instance.workspaceReceipt.access,
					worktreeRoot: instance.workspaceReceipt.worktreeRoot,
					worktreeIdentity: instance.workspaceReceipt.worktreeIdentity,
					branch: instance.workspaceReceipt.branch,
				}
			: undefined,
		sessionId: instance.sessionId,
		sessionFile: instance.sessionFile,
		radiusPiId: instance.radiusPiId,
		completedAt: instance.completedAt,
		terminationOutcome: instance.terminationOutcome,
		terminalDiagnostic: instance.terminalDiagnostic,
		currentActivity: instance.currentActivity,
		activityUpdatedAt: instance.activityUpdatedAt,
		latestOutput: instance.latestOutput,
		pendingInput: instance.pendingUiRequest !== undefined || instance.status === "waiting-input",
	};
}

function unknownInstanceError(instanceId: string): ErrorResponse {
	return {
		type: "error",
		ok: false,
		error: `Unknown instance: ${instanceId}`,
	};
}

// Overhead types
export async function handleIpcRequest(request: SpawnRequest): Promise<SpawnResponse | ErrorResponse>;
export async function handleIpcRequest(request: ListRequest): Promise<ListResponse | ErrorResponse>;
export async function handleIpcRequest(request: HealthRequest): Promise<HealthResponse | ErrorResponse>;
export async function handleIpcRequest(request: ShutdownRequest): Promise<ShutdownResponse | ErrorResponse>;
export async function handleIpcRequest(request: StopRequest): Promise<StopResponse | ErrorResponse>;
export async function handleIpcRequest(request: CancelRequest): Promise<CancelResponse | ErrorResponse>;
export async function handleIpcRequest(request: StatusRequest): Promise<StatusResponse | ErrorResponse>;
export async function handleIpcRequest(request: RpcRequest): Promise<RpcBridgeResponse | ErrorResponse>;
export async function handleIpcRequest(request: RpcStreamRequest): Promise<RpcReadyResponse | ErrorResponse>;
export async function handleIpcRequest(request: OrchestratorRequest): Promise<OrchestratorResponse>;
export async function handleIpcRequest(request: OrchestratorRequest): Promise<OrchestratorResponse> {
	switch (request.type) {
		case "spawn": {
			const instance = await supervisor.spawnInstance({
				cwd: request.cwd,
				workspaceAccess: request.workspaceAccess,
				label: request.label,
				parentInstanceId: request.parentInstanceId,
				parentSessionId: request.parentSessionId,
			});
			return {
				type: "spawn_result",
				ok: true,
				instance: toInstanceSummary(instance),
			};
		}

		case "list": {
			return {
				type: "list_result",
				ok: true,
				instances: supervisor.listInstances().map(toInstanceSummary),
			};
		}

		case "health":
		case "shutdown":
			return {
				type: "error",
				ok: false,
				error: "Maestro service control is unavailable outside the service owner",
			};

		case "status": {
			const instance = supervisor.getInstance(request.instanceId);
			if (!instance) {
				return unknownInstanceError(request.instanceId);
			}

			return {
				type: "status_result",
				ok: true,
				instance: toInstanceSummary(instance),
			};
		}

		case "stop": {
			const instance = await supervisor.stopInstance(request.instanceId);
			if (!instance) {
				return unknownInstanceError(request.instanceId);
			}

			return {
				type: "stop_result",
				ok: true,
				instanceId: request.instanceId,
			};
		}

		case "cancel": {
			const cancellation = await supervisor.cancelInstance(request.instanceId, request.commandId);
			return {
				type: "cancel_result",
				ok: true,
				cancellation,
			};
		}

		case "rpc": {
			const response = await supervisor.handleRpc(request.instanceId, request.command, {
				ownerId: request.ownerId,
				ownerGeneration: request.ownerGeneration,
			});
			if (!response) {
				return unknownInstanceError(request.instanceId);
			}

			return {
				type: "rpc_result",
				ok: true,
				response,
			};
		}

		case "rpc_stream": {
			const instance = supervisor.getInstance(request.instanceId);
			if (!instance) {
				return unknownInstanceError(request.instanceId);
			}
			return {
				type: "rpc_ready",
				ok: true,
				instance: toInstanceSummary(instance),
			};
		}
	}
}

export function openRpcStream(
	instanceId: string,
	onResponse: (response: RpcResponse) => void,
	onSessionEvent: (event: AgentSessionEvent) => void,
	onUiRequest: (request: RpcExtensionUIRequest) => void,
	options?: { mode?: "interactive" | "read-only"; ownerId?: string },
):
	| {
			attachment: NonNullable<RpcReadyResponse["attachment"]>;
			replay: NonNullable<RpcReadyResponse["replay"]>;
			handleRequest(request: RpcCommand | RpcExtensionUIResponse): Promise<void>;
			close(): void;
	  }
	| undefined {
	const handle = supervisor.openRpcStream(instanceId, onSessionEvent, onUiRequest, options);
	if (!handle) {
		return undefined;
	}

	return {
		attachment: handle.attachment,
		replay: handle.replay,
		async handleRequest(request): Promise<void> {
			if (request.type === "extension_ui_response") {
				handle.handleUiResponse(request);
				return;
			}
			const response = await handle.handleRpc(request);
			onResponse(response);
		},
		close(): void {
			handle.close();
		},
	};
}
