import assert from "node:assert/strict";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, it } from "node:test";
import { RpcProcessInstance } from "../src/rpc-process.ts";
import { loadInstances, saveInstances } from "../src/storage.ts";
import { OrchestratorSupervisor } from "../src/supervisor.ts";

function createFakeChild(): {
	child: ChildProcess;
	stdin: PassThrough;
	stdout: PassThrough;
	killSignals: Array<number | NodeJS.Signals | undefined>;
} {
	const child = new EventEmitter() as ChildProcess;
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const killSignals: Array<number | NodeJS.Signals | undefined> = [];
	child.stdin = stdin;
	child.stdout = stdout;
	child.stderr = stderr;
	child.kill = (signal) => {
		killSignals.push(signal);
		queueMicrotask(() => child.emit("exit", 0, "SIGTERM"));
		return true;
	};
	return { child, stdin, stdout, killSignals };
}

async function nextTurn(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("Maestro inherited RPC behavior", () => {
	it("routes first state, events, and UI request/response traffic", async () => {
		const fake = createFakeChild();
		const rpc = new RpcProcessInstance({ cwd: process.cwd() }, () => fake.child);
		const events: Array<{ type?: string }> = [];
		const uiRequests: Array<{ type?: string; id?: string }> = [];
		rpc.onEvent((event) => events.push(event));
		rpc.setUiRequestHandler((request) => uiRequests.push(request));

		const written = once(fake.stdin, "data");
		const statePromise = rpc.send({ type: "get_state" });
		const [chunk] = await written;
		const request = JSON.parse(String(chunk)) as { id: string };
		fake.stdout.write(
			`${JSON.stringify({ type: "response", id: request.id, command: "get_state", success: true, data: { sessionId: "s1" } })}\n`,
		);
		const state = await statePromise;
		assert.equal(state.command, "get_state");
		assert.equal(state.success, true);

		fake.stdout.write(`${JSON.stringify({ type: "message_update", delta: "x" })}\n`);
		fake.stdout.write(`${JSON.stringify({ type: "extension_ui_request", id: "ui1", method: "confirm" })}\n`);
		await nextTurn();
		assert.equal(events[0]?.type, "message_update");
		assert.deepEqual(uiRequests[0], { type: "extension_ui_request", id: "ui1", method: "confirm" });

		const uiResponseWritten = once(fake.stdin, "data");
		rpc.handleUiResponse({ type: "extension_ui_response", id: "ui1", confirmed: true });
		const [uiChunk] = await uiResponseWritten;
		assert.equal(Buffer.isBuffer(uiChunk), true);
		await rpc.dispose();
	});

	it("rejects pending work and reports an unexpected child exit", async () => {
		const fake = createFakeChild();
		const rpc = new RpcProcessInstance({ cwd: process.cwd() }, () => fake.child);
		const exits: Array<Error | undefined> = [];
		rpc.onExit((error) => exits.push(error));
		const pending = rpc.send({ type: "get_state" });

		fake.child.stderr?.emit("data", "OPENAI_API_KEY=must-not-leak");
		fake.child.emit("exit", 9, null);
		await assert.rejects(
			pending,
			(error: unknown) =>
				error instanceof Error &&
				/code=9/.test(error.message) &&
				/Child stderr captured/.test(error.message) &&
				!error.message.includes("must-not-leak"),
		);
		assert.equal(exits.length, 1);
		assert.throws(() => rpc.send({ type: "get_state" }), /not running/);
	});

	it("requests SIGTERM and waits for child exit during disposal", async () => {
		const fake = createFakeChild();
		const rpc = new RpcProcessInstance({ cwd: process.cwd() }, () => fake.child);
		await rpc.dispose();
		assert.deepEqual(fake.killSignals, ["SIGTERM"]);
	});

	it("starts read-only workspace processes without tools and marks their environment", async () => {
		const fake = createFakeChild();
		let args: string[] = [];
		let spawnOptions: SpawnOptions | undefined;
		const rpc = new RpcProcessInstance(
			{ cwd: process.cwd(), workspaceAccess: "read-only" },
			(_command, observedArgs, observedOptions) => {
				args = observedArgs;
				spawnOptions = observedOptions;
				return fake.child;
			},
			{ command: "node", args: ["rpc-entry.js"] },
		);
		assert.deepEqual(args, ["rpc-entry.js", "--no-tools"]);
		assert.equal(spawnOptions?.env?.RECODE_WORKSPACE_ACCESS, "read-only");
		await rpc.dispose();
	});
});

describe("Maestro inherited restart recovery", () => {
	const originalDir = process.env.PI_ORCHESTRATOR_DIR;
	let testDir: string | undefined;

	afterEach(() => {
		if (originalDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
		else process.env.PI_ORCHESTRATOR_DIR = originalDir;
		if (testDir) rmSync(testDir, { recursive: true, force: true });
		testDir = undefined;
	});

	it("marks formerly live records stopped without reviving child processes", async () => {
		testDir = mkdtempSync(join(tmpdir(), "maestro-o0-"));
		process.env.PI_ORCHESTRATOR_DIR = testDir;
		const now = new Date().toISOString();
		saveInstances([
			{ id: "online", status: "online", cwd: process.cwd(), createdAt: now, lastSeenAt: now },
			{ id: "starting", status: "starting", cwd: process.cwd(), createdAt: now, lastSeenAt: now },
			{ id: "error", status: "error", cwd: process.cwd(), createdAt: now, lastSeenAt: now },
		]);

		await new OrchestratorSupervisor().recoverAfterRestart();
		assert.deepEqual(
			loadInstances().map(({ id, status }) => ({ id, status })),
			[
				{ id: "online", status: "stopped" },
				{ id: "starting", status: "stopped" },
				{ id: "error", status: "error" },
			],
		);
	});
});
