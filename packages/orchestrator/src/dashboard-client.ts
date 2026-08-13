import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import type {
	AgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@reitaard/recode-coding-agent";
import { getSocketPath } from "./config.ts";
import { sendIpcRequest } from "./ipc/client.ts";
import { encodeMessage, type InstanceSummary, type RpcReadyResponse } from "./ipc/protocol.ts";
import { readIpcAuthToken } from "./ipc-auth.ts";
import type { MaestroServiceHealth } from "./types.ts";

const MAX_STREAM_BUFFER_BYTES = 1_048_576;
const ATTACH_TIMEOUT_MS = 5_000;

export interface MaestroDashboardSnapshot {
	health: MaestroServiceHealth;
	instances: InstanceSummary[];
}

export interface MaestroDashboardAttachment {
	readonly ownerId: string;
	readonly ownerGeneration: number;
	readonly replay: NonNullable<RpcReadyResponse["replay"]>;
	send(command: RpcCommand | RpcExtensionUIResponse): void;
	close(): void;
}

export interface MaestroDashboardClient {
	refresh(): Promise<MaestroDashboardSnapshot>;
	attach(
		instanceId: string,
		onEvent: (event: AgentSessionEvent) => void,
		onUiRequest: (request: RpcExtensionUIRequest) => void,
		onResponse: (response: RpcResponse) => void,
		onClose: (error?: Error) => void,
	): Promise<MaestroDashboardAttachment>;
	cancel(instanceId: string): Promise<void>;
	stop(instanceId: string): Promise<void>;
}

function isUiRequest(value: { type?: string }): value is RpcExtensionUIRequest {
	return value.type === "extension_ui_request";
}

function isRpcResponse(value: { type?: string }): value is RpcResponse {
	return value.type === "response";
}

function isRpcReady(value: { type?: string }): value is RpcReadyResponse {
	return value.type === "rpc_ready";
}

export class IpcMaestroDashboardClient implements MaestroDashboardClient {
	async refresh(): Promise<MaestroDashboardSnapshot> {
		const [healthResponse, listResponse] = await Promise.all([
			sendIpcRequest({ type: "health" }, { timeoutMs: 1_000 }),
			sendIpcRequest({ type: "list" }, { timeoutMs: 1_000 }),
		]);
		if (!healthResponse.ok || healthResponse.type !== "health_result" || !healthResponse.health) {
			throw new Error(healthResponse.error ?? "Maestro health is unavailable");
		}
		if (!listResponse.ok || listResponse.type !== "list_result") {
			throw new Error(listResponse.error ?? "Maestro session list is unavailable");
		}
		return { health: healthResponse.health, instances: listResponse.instances ?? [] };
	}

	async cancel(instanceId: string): Promise<void> {
		const response = await sendIpcRequest({ type: "cancel", instanceId }, { timeoutMs: 3_000 });
		if (!response.ok) throw new Error(response.error ?? "Maestro cancellation failed");
	}

	async stop(instanceId: string): Promise<void> {
		const response = await sendIpcRequest({ type: "stop", instanceId }, { timeoutMs: 8_000 });
		if (!response.ok) throw new Error(response.error ?? "Maestro stop failed");
	}

	async attach(
		instanceId: string,
		onEvent: (event: AgentSessionEvent) => void,
		onUiRequest: (request: RpcExtensionUIRequest) => void,
		onResponse: (response: RpcResponse) => void,
		onClose: (error?: Error) => void,
	): Promise<MaestroDashboardAttachment> {
		const socket = createConnection(getSocketPath());
		const authToken = readIpcAuthToken();
		const ownerId = `dashboard:${randomUUID()}`;
		let buffer = "";
		let ready: RpcReadyResponse | undefined;
		let settled = false;
		let closed = false;
		let closeNotified = false;
		return await new Promise<MaestroDashboardAttachment>((resolve, reject) => {
			const timer = setTimeout(() => {
				if (settled) return;
				settled = true;
				socket.destroy();
				reject(new Error(`Maestro attachment timed out after ${ATTACH_TIMEOUT_MS}ms`));
			}, ATTACH_TIMEOUT_MS);
			timer.unref();
			const notifyClose = (error?: Error): void => {
				if (closed || closeNotified) return;
				closeNotified = true;
				onClose(error);
			};
			const fail = (error: Error): void => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					reject(error);
					return;
				}
				if (ready) notifyClose(error);
			};
			socket.once("connect", () => {
				socket.write(encodeMessage({ type: "rpc_stream", instanceId, mode: "interactive", ownerId, authToken }));
			});
			socket.on("data", (chunk: Buffer | string) => {
				buffer += chunk.toString();
				if (Buffer.byteLength(buffer) > MAX_STREAM_BUFFER_BYTES) {
					socket.destroy(new Error("Maestro attachment buffer limit reached"));
					return;
				}
				for (;;) {
					const newlineIndex = buffer.indexOf("\n");
					if (newlineIndex === -1) break;
					const line = buffer.slice(0, newlineIndex).trim();
					buffer = buffer.slice(newlineIndex + 1);
					if (!line) continue;
					let parsed: { type?: string; ok?: boolean; error?: string };
					try {
						parsed = JSON.parse(line) as { type?: string; ok?: boolean; error?: string };
					} catch {
						socket.destroy(new Error("Maestro returned malformed attachment JSON"));
						return;
					}
					if (!ready) {
						if (!isRpcReady(parsed) || !parsed.ok || !parsed.attachment?.ownerGeneration) {
							socket.destroy();
							fail(new Error(parsed.error ?? "Maestro attachment was rejected"));
							return;
						}
						ready = parsed;
						settled = true;
						clearTimeout(timer);
						resolve({
							ownerId,
							ownerGeneration: parsed.attachment.ownerGeneration,
							replay: parsed.replay ?? { events: [] },
							send(message): void {
								if (closed || socket.destroyed) throw new Error("Maestro attachment is closed");
								socket.write(encodeMessage(message));
							},
							close(): void {
								if (closed) return;
								closed = true;
								socket.end();
							},
						});
						continue;
					}
					if (isUiRequest(parsed)) onUiRequest(parsed);
					else if (isRpcResponse(parsed)) onResponse(parsed);
					else onEvent(parsed as AgentSessionEvent);
				}
			});
			socket.on("error", (error) => fail(error));
			socket.on("close", () => {
				if (!settled) fail(new Error("Maestro attachment closed before readiness"));
				else if (ready) notifyClose();
			});
		});
	}
}
