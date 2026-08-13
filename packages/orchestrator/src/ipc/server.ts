import { chmodSync, existsSync, unlinkSync } from "node:fs";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import type { AgentSessionEvent, RpcExtensionUIRequest, RpcResponse } from "@reitaard/recode-coding-agent";
import { getSocketPath, isFilesystemSocketPath } from "../config.ts";
import { authenticateIpcToken, ensureIpcAuthToken } from "../ipc-auth.ts";
import {
	type CancelRequest,
	type CancelResponse,
	type ErrorResponse,
	encodeMessage,
	type HealthRequest,
	type HealthResponse,
	type ListRequest,
	type ListResponse,
	type OrchestratorRequest,
	type OrchestratorResponse,
	parseRequestLine,
	type RpcBridgeResponse,
	type RpcReadyResponse,
	type RpcRequest,
	type RpcStreamRequest,
	type ShutdownRequest,
	type ShutdownResponse,
	type SpawnRequest,
	type SpawnResponse,
	type StatusRequest,
	type StatusResponse,
	type StopRequest,
	type StopResponse,
} from "./protocol.ts";

const MAX_IPC_MESSAGE_BYTES = 1_048_576;
const MAX_QUEUED_RPC_REQUESTS = 64;
const serverSockets = new WeakMap<Server, Set<Socket>>();

export interface IpcRequestHandler {
	(request: SpawnRequest): Promise<SpawnResponse | ErrorResponse> | SpawnResponse | ErrorResponse;
	(request: ListRequest): Promise<ListResponse | ErrorResponse> | ListResponse | ErrorResponse;
	(request: HealthRequest): Promise<HealthResponse | ErrorResponse> | HealthResponse | ErrorResponse;
	(request: ShutdownRequest): Promise<ShutdownResponse | ErrorResponse> | ShutdownResponse | ErrorResponse;
	(request: StopRequest): Promise<StopResponse | ErrorResponse> | StopResponse | ErrorResponse;
	(request: CancelRequest): Promise<CancelResponse | ErrorResponse> | CancelResponse | ErrorResponse;
	(request: StatusRequest): Promise<StatusResponse | ErrorResponse> | StatusResponse | ErrorResponse;
	(request: RpcRequest): Promise<RpcBridgeResponse | ErrorResponse> | RpcBridgeResponse | ErrorResponse;
	(request: RpcStreamRequest): Promise<RpcReadyResponse | ErrorResponse> | RpcReadyResponse | ErrorResponse;
	(request: OrchestratorRequest): Promise<OrchestratorResponse> | OrchestratorResponse;
	openRpcStream(
		instanceId: string,
		onResponse: (response: RpcResponse) => void,
		onSessionEvent: (event: AgentSessionEvent) => void,
		onUiRequest: (request: RpcExtensionUIRequest) => void,
		options?: { mode?: "interactive" | "read-only"; ownerId?: string },
	):
		| {
				attachment: NonNullable<RpcReadyResponse["attachment"]>;
				replay: NonNullable<RpcReadyResponse["replay"]>;
				handleRequest(request: RpcRequest["command"] | { type: "extension_ui_response" }): Promise<void>;
				close(): void;
		  }
		| undefined;
}

export async function startIpcServer(handler: IpcRequestHandler): Promise<Server> {
	const socketPath = getSocketPath();
	const expectedAuthToken = ensureIpcAuthToken();
	if (isFilesystemSocketPath(socketPath)) await removeStaleSocketIfNeeded(socketPath);

	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		let buffer = "";
		const writeBounded = (
			message: OrchestratorResponse | RpcResponse | AgentSessionEvent | RpcExtensionUIRequest,
		): void => {
			const encoded = encodeMessage(message);
			if (socket.writableLength + Buffer.byteLength(encoded) > MAX_IPC_MESSAGE_BYTES) {
				socket.destroy(new Error("IPC output buffer limit reached"));
				return;
			}
			socket.write(encoded);
		};

		socket.on("data", async (chunk: Buffer | string) => {
			buffer += chunk.toString();
			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex === -1) {
				if (Buffer.byteLength(buffer) > MAX_IPC_MESSAGE_BYTES)
					socket.destroy(new Error("IPC message limit reached"));
				return;
			}
			if (Buffer.byteLength(buffer.slice(0, newlineIndex)) > MAX_IPC_MESSAGE_BYTES) {
				socket.destroy(new Error("IPC message limit reached"));
				return;
			}

			const line = buffer.slice(0, newlineIndex).trim();
			buffer = buffer.slice(newlineIndex + 1);
			if (!line) {
				return;
			}

			try {
				const authenticatedRequest = parseRequestLine(line);
				if (!authenticateIpcToken(expectedAuthToken, authenticatedRequest.authToken)) {
					socket.end(encodeMessage({ type: "error", ok: false, error: "Maestro IPC authentication failed" }));
					return;
				}
				const { authToken: _authToken, ...requestPayload } = authenticatedRequest;
				const request = requestPayload as OrchestratorRequest;
				if (request.type === "rpc_stream") {
					const response = await handler(request);
					if (!response.ok || response.type !== "rpc_ready" || !response.instance) {
						socket.end(encodeMessage(response));
						return;
					}

					socket.removeAllListeners("data");
					const rpcStream = handler.openRpcStream(
						request.instanceId,
						(response) => writeBounded(response),
						(event) => writeBounded(event),
						(uiRequest) => writeBounded(uiRequest),
						{ mode: request.mode, ownerId: request.ownerId },
					);
					if (!rpcStream) {
						socket.end(
							encodeMessage({ type: "error", ok: false, error: `Unknown instance: ${request.instanceId}` }),
						);
						return;
					}

					writeBounded({ ...response, attachment: rpcStream.attachment, replay: rpcStream.replay });
					let rpcRequestQueue = Promise.resolve();
					let queuedRpcRequests = 0;
					socket.on("data", (rpcChunk: Buffer | string) => {
						buffer += rpcChunk.toString();
						for (;;) {
							const rpcNewlineIndex = buffer.indexOf("\n");
							if (rpcNewlineIndex === -1) {
								if (Buffer.byteLength(buffer) > MAX_IPC_MESSAGE_BYTES) {
									socket.destroy(new Error("IPC message limit reached"));
								}
								break;
							}
							if (Buffer.byteLength(buffer.slice(0, rpcNewlineIndex)) > MAX_IPC_MESSAGE_BYTES) {
								socket.destroy(new Error("IPC message limit reached"));
								return;
							}
							const rpcLine = buffer.slice(0, rpcNewlineIndex).trim();
							buffer = buffer.slice(rpcNewlineIndex + 1);
							if (!rpcLine) {
								continue;
							}
							if (queuedRpcRequests >= MAX_QUEUED_RPC_REQUESTS) {
								socket.destroy(new Error("IPC RPC request queue limit reached"));
								return;
							}
							queuedRpcRequests += 1;
							rpcRequestQueue = rpcRequestQueue
								.then(async () => {
									try {
										await rpcStream.handleRequest(JSON.parse(rpcLine));
									} catch (rpcError: unknown) {
										writeBounded({
											type: "error",
											ok: false,
											error: rpcError instanceof Error ? rpcError.message : String(rpcError),
										});
									}
								})
								.catch((rpcError: Error) => {
									writeBounded({ type: "error", ok: false, error: rpcError.message });
								})
								.finally(() => {
									queuedRpcRequests -= 1;
								});
						}
					});
					socket.once("close", () => rpcStream.close());
					return;
				}

				const response = await handler(request);
				socket.end(encodeMessage(response));
			} catch (error: unknown) {
				const response: ErrorResponse = {
					type: "error",
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				};
				socket.end(encodeMessage(response));
			}
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen({ path: socketPath, readableAll: false, writableAll: false }, () => {
			server.off("error", reject);
			resolve();
		});
	});

	if (isFilesystemSocketPath(socketPath)) chmodSync(socketPath, 0o600);
	serverSockets.set(server, sockets);
	return server;
}

export async function closeIpcServer(server: Server): Promise<void> {
	const sockets = serverSockets.get(server);
	for (const socket of sockets ?? []) socket.destroy();
	await new Promise<void>((resolve) => {
		server.close(() => resolve());
	});
	serverSockets.delete(server);
}

async function removeStaleSocketIfNeeded(socketPath: string): Promise<void> {
	if (!existsSync(socketPath)) {
		return;
	}

	const isLive = await isSocketLive(socketPath);
	if (isLive) {
		throw new Error(`orchestrator is already running: ${socketPath}`);
	}

	unlinkSync(socketPath);
}

async function isSocketLive(socketPath: string): Promise<boolean> {
	return new Promise<boolean>((resolve, reject) => {
		const socket = createConnection(socketPath);
		let settled = false;

		const finish = (result: boolean) => {
			if (settled) {
				return;
			}
			settled = true;
			socket.removeAllListeners();
			socket.destroy();
			resolve(result);
		};

		socket.on("connect", () => finish(true));
		socket.on("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "ECONNREFUSED" || error.code === "ENOENT") {
				finish(false);
				return;
			}
			if (error.code === "EPIPE" || error.code === "ECONNRESET") {
				finish(false);
				return;
			}
			if (settled) {
				return;
			}
			settled = true;
			socket.removeAllListeners();
			socket.destroy();
			reject(error);
		});
	});
}
