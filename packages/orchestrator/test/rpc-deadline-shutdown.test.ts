import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { RpcProcessInstance, RpcRequestCancelledError, RpcRequestTimeoutError } from "../src/rpc-process.ts";

function fakeChild(exitOnSignal?: NodeJS.Signals): {
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
		if (signal === exitOnSignal) queueMicrotask(() => child.emit("exit", 0, signal));
		return true;
	};
	return { child, stdin, stdout, killSignals };
}

async function nextTurn(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

function writeResponse(stdout: PassThrough, id: string, command: string): void {
	stdout.write(`${JSON.stringify({ type: "response", id, command, success: true })}\n`);
}

describe("RPC deadlines and cancellation", () => {
	it("removes timed-out requests and allows later independent work", async () => {
		const fake = fakeChild("SIGTERM");
		const rpc = new RpcProcessInstance({ cwd: process.cwd(), requestTimeoutMs: 10 }, () => fake.child);
		await assert.rejects(rpc.send({ id: "slow", type: "get_state" }), RpcRequestTimeoutError);
		const next = rpc.send({ id: "next", type: "get_state" });
		writeResponse(fake.stdout, "next", "get_state");
		assert.equal((await next).success, true);
		writeResponse(fake.stdout, "slow", "get_state");
		await rpc.dispose();
	});

	it("requests best-effort remote abort when a prompt deadline expires", async () => {
		const fake = fakeChild("SIGTERM");
		const writes: Array<{ id: string; type: string }> = [];
		fake.stdin.on("data", (chunk) => writes.push(JSON.parse(String(chunk)) as { id: string; type: string }));
		const rpc = new RpcProcessInstance({ cwd: process.cwd(), requestTimeoutMs: 10 }, () => fake.child);
		await assert.rejects(rpc.send({ id: "timed-prompt", type: "prompt", message: "wait" }), RpcRequestTimeoutError);
		assert.ok(writes.some((write) => write.type === "abort"));
		await rpc.dispose();
	});

	it("removes locally aborted requests and rejects duplicate or excessive pending IDs", async () => {
		const fake = fakeChild("SIGTERM");
		const rpc = new RpcProcessInstance({ cwd: process.cwd(), maxPendingRequests: 2 }, () => fake.child);
		const controller = new AbortController();
		const pending = rpc.send({ id: "one", type: "get_state" }, { signal: controller.signal });
		assert.throws(() => rpc.send({ id: "one", type: "get_state" }), /Duplicate or stale RPC request id/);
		const second = rpc.send({ id: "two", type: "get_state" });
		assert.throws(() => rpc.send({ id: "three", type: "get_state" }), /pending request limit/);
		controller.abort();
		await assert.rejects(pending, RpcRequestCancelledError);
		writeResponse(fake.stdout, "two", "get_state");
		await second;
		assert.throws(() => rpc.send({ id: "one", type: "get_state" }), /Duplicate or stale RPC request id/);
		const replacement = rpc.send({ id: "replacement", type: "get_state" });
		writeResponse(fake.stdout, "replacement", "get_state");
		await replacement;
		await rpc.dispose();
	});

	it("distinguishes completed, unsupported, and unknown command cancellation", async () => {
		const fake = fakeChild("SIGTERM");
		const writes: Array<{ id: string; type: string }> = [];
		fake.stdin.on("data", (chunk) => {
			writes.push(JSON.parse(String(chunk)) as { id: string; type: string });
		});
		const rpc = new RpcProcessInstance({ cwd: process.cwd() }, () => fake.child);
		const prompt = rpc.send({ id: "prompt-1", type: "prompt", message: "wait" });
		assert.throws(() => rpc.send({ id: "prompt-2", type: "prompt", message: "overlap" }), /concurrent prompt limit/);
		await nextTurn();
		const cancellation = rpc.cancel("prompt-1");
		await nextTurn();
		const abort = writes.find((write) => write.type === "abort");
		assert.ok(abort);
		writeResponse(fake.stdout, abort.id, "abort");
		assert.deepEqual(await cancellation, {
			commandId: "prompt-1",
			requested: true,
			accepted: true,
			completed: true,
			unsupported: false,
			unknown: false,
		});
		const state = rpc.send({ id: "state-1", type: "get_state" });
		assert.equal((await rpc.cancel("state-1")).unsupported, true);
		assert.equal((await rpc.cancel("missing")).unknown, true);
		writeResponse(fake.stdout, "state-1", "get_state");
		writeResponse(fake.stdout, "prompt-1", "prompt");
		await Promise.all([state, prompt]);
		await rpc.dispose();
	});
});

describe("bounded RPC shutdown", () => {
	it("escalates from SIGTERM to SIGKILL and verifies forced exit", async () => {
		const fake = fakeChild("SIGKILL");
		const rpc = new RpcProcessInstance(
			{ cwd: process.cwd(), gracefulShutdownMs: 5, forceKillWaitMs: 20 },
			() => fake.child,
		);
		assert.deepEqual(await rpc.dispose(), { graceful: false, forced: true, exited: true });
		assert.deepEqual(fake.killSignals, ["SIGTERM", "SIGKILL"]);
	});

	it("returns a bounded unverified outcome when even SIGKILL does not exit", async () => {
		const fake = fakeChild();
		const rpc = new RpcProcessInstance(
			{ cwd: process.cwd(), gracefulShutdownMs: 5, forceKillWaitMs: 5 },
			() => fake.child,
		);
		assert.deepEqual(await rpc.dispose(), { graceful: false, forced: true, exited: false });
		assert.deepEqual(fake.killSignals, ["SIGTERM", "SIGKILL"]);
	});
});
