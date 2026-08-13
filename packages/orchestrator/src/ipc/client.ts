import { createConnection } from "node:net";
import { getSocketPath } from "../config.ts";
import { readIpcAuthToken } from "../ipc-auth.ts";
import { encodeMessage, type OrchestratorRequest, type OrchestratorResponse, parseResponseLine } from "./protocol.ts";

const MAX_RESPONSE_BUFFER_BYTES = 1_048_576;
const DEFAULT_CONTROL_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_SPAWN_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MUTATION_REQUEST_TIMEOUT_MS = 30_000;

export function getDefaultIpcRequestTimeoutMs(request: OrchestratorRequest): number {
	if (request.type === "spawn") return DEFAULT_SPAWN_REQUEST_TIMEOUT_MS;
	if (request.type === "rpc" || request.type === "cancel" || request.type === "stop" || request.type === "shutdown") {
		return DEFAULT_MUTATION_REQUEST_TIMEOUT_MS;
	}
	return DEFAULT_CONTROL_REQUEST_TIMEOUT_MS;
}

export async function sendIpcRequest(
	request: OrchestratorRequest,
	options: { timeoutMs?: number } = {},
): Promise<OrchestratorResponse> {
	const socketPath = getSocketPath();
	const authToken = readIpcAuthToken();
	const timeoutMs = options.timeoutMs ?? getDefaultIpcRequestTimeoutMs(request);
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("IPC timeoutMs must be a positive finite number");

	return new Promise<OrchestratorResponse>((resolve, reject) => {
		const socket = createConnection(socketPath);
		let buffer = "";
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			reject(new Error(`Maestro IPC request timed out after ${timeoutMs}ms`));
			cleanup();
		}, timeoutMs);
		timer.unref();

		const cleanup = () => {
			clearTimeout(timer);
			socket.removeAllListeners();
			socket.destroy();
		};

		socket.on("connect", () => {
			socket.write(encodeMessage({ ...request, authToken }));
		});

		socket.on("data", (chunk: Buffer | string) => {
			buffer += chunk.toString();
			if (Buffer.byteLength(buffer) > MAX_RESPONSE_BUFFER_BYTES) {
				settled = true;
				reject(new Error("Maestro IPC response exceeded the buffer limit"));
				cleanup();
				return;
			}
			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex === -1) {
				return;
			}

			const line = buffer.slice(0, newlineIndex).trim();
			if (!line) {
				return;
			}

			try {
				settled = true;
				resolve(parseResponseLine(line));
				cleanup();
			} catch (error) {
				settled = true;
				reject(error);
				cleanup();
			}
		});

		socket.on("error", (error) => {
			if (settled) {
				return;
			}
			settled = true;
			reject(error);
			cleanup();
		});

		socket.on("end", () => {
			if (settled) {
				return;
			}
			settled = true;
			reject(new Error(`Orchestrator socket closed before a response was received: ${socketPath}`));
			cleanup();
		});
	});
}
