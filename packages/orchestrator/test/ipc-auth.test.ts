import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { getIpcAuthPath, getSocketPath } from "../src/config.ts";
import { getDefaultIpcRequestTimeoutMs, sendIpcRequest } from "../src/ipc/client.ts";
import { encodeMessage, type OrchestratorRequest, type OrchestratorResponse } from "../src/ipc/protocol.ts";
import { closeIpcServer, type IpcRequestHandler, startIpcServer } from "../src/ipc/server.ts";
import { authenticateIpcToken, ensureIpcAuthToken, readIpcAuthToken } from "../src/ipc-auth.ts";

const originalDir = process.env.PI_ORCHESTRATOR_DIR;
let directory: string | undefined;

afterEach(() => {
	if (originalDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
	else process.env.PI_ORCHESTRATOR_DIR = originalDir;
	if (directory) rmSync(directory, { recursive: true, force: true });
	directory = undefined;
});

function useDirectory(): string {
	directory = mkdtempSync(join(tmpdir(), "maestro-ipc-auth-"));
	process.env.PI_ORCHESTRATOR_DIR = directory;
	return directory;
}

async function rawRequest(message: string): Promise<string> {
	return await new Promise<string>((resolve, reject) => {
		const socket = createConnection(getSocketPath());
		let buffer = "";
		socket.once("connect", () => socket.write(message));
		socket.on("data", (chunk: Buffer | string) => {
			buffer += chunk.toString();
			if (buffer.includes("\n")) resolve(buffer);
		});
		socket.once("error", reject);
	});
}

describe("Maestro IPC authentication", () => {
	it("gives cold spawn and mutating requests bounded operation-specific deadlines", () => {
		assert.equal(
			getDefaultIpcRequestTimeoutMs({ type: "spawn", cwd: process.cwd(), workspaceAccess: "read-only" }),
			60_000,
		);
		assert.equal(
			getDefaultIpcRequestTimeoutMs({ type: "rpc", instanceId: "instance", command: { type: "get_state" } }),
			30_000,
		);
		assert.equal(getDefaultIpcRequestTimeoutMs({ type: "list" }), 5_000);
	});

	it("creates one private stable token and rejects malformed or over-permissive files", () => {
		useDirectory();
		const first = ensureIpcAuthToken();
		assert.equal(readIpcAuthToken(), first);
		assert.equal(ensureIpcAuthToken(), first);
		assert.equal(authenticateIpcToken(first, first), true);
		assert.equal(authenticateIpcToken(first, "x".repeat(43)), false);
		if (process.platform !== "win32") {
			assert.equal(statSync(getIpcAuthPath()).mode & 0o077, 0);
			chmodSync(directory!, 0o755);
			assert.equal(readIpcAuthToken(), first);
			assert.equal(statSync(directory!).mode & 0o077, 0);
			chmodSync(getIpcAuthPath(), 0o644);
			assert.throws(() => readIpcAuthToken(), /permissions must be 0600/);
		}
		writeFileSync(getIpcAuthPath(), "{}\n", "utf8");
		if (process.platform !== "win32") chmodSync(getIpcAuthPath(), 0o600);
		assert.throws(() => readIpcAuthToken(), /authentication file is invalid/);
	});

	it("authenticates request and stream handshakes before dispatch", async () => {
		useDirectory();
		const requestHandler = (async (_request: OrchestratorRequest): Promise<OrchestratorResponse> => ({
			type: "list_result",
			ok: true,
			instances: [],
		})) as IpcRequestHandler;
		const server = await startIpcServer(requestHandler);
		try {
			if (process.platform !== "win32") assert.equal(statSync(getSocketPath()).mode & 0o077, 0);
			const rejected = JSON.parse((await rawRequest(encodeMessage({ type: "list" }))).trim()) as {
				ok?: boolean;
				error?: string;
			};
			assert.equal(rejected.ok, false);
			assert.equal(rejected.error, "Maestro IPC authentication failed");
			const rejectedStream = JSON.parse(
				(await rawRequest(encodeMessage({ type: "rpc_stream", instanceId: "instance" }))).trim(),
			) as { ok?: boolean; error?: string };
			assert.equal(rejectedStream.ok, false);
			assert.equal(rejectedStream.error, "Maestro IPC authentication failed");
			const accepted = await sendIpcRequest({ type: "list" });
			assert.equal(accepted.ok, true);
			assert.doesNotMatch(readFileSync(getIpcAuthPath(), "utf8"), /list_result/);
		} finally {
			await closeIpcServer(server);
		}
	});
});
