import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import type { RpcResponse } from "@reitaard/recode-coding-agent";
import { getInstancesPath } from "../src/config.ts";
import { verifyProcessIdentity } from "../src/process-identity.ts";
import {
	clearStorageDiagnostics,
	getStorageDiagnostics,
	loadInstances,
	OrchestratorStorageError,
	saveInstances,
} from "../src/storage.ts";
import { DEFAULT_MAX_LIVE_INSTANCES, OrchestratorSupervisor, type SupervisorRpcProcess } from "../src/supervisor.ts";
import type { InstanceRecord } from "../src/types.ts";

async function nextTurn(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

function instance(id: string, status: InstanceRecord["status"] = "online", completedAt?: string): InstanceRecord {
	return {
		id,
		status,
		cwd: process.cwd(),
		createdAt: "2026-07-28T00:00:00.000Z",
		lastSeenAt: "2026-07-28T00:00:00.000Z",
		completedAt,
	};
}

describe("orchestrator durable lifecycle storage", () => {
	const originalDir = process.env.PI_ORCHESTRATOR_DIR;
	let testDir: string | undefined;

	afterEach(() => {
		clearStorageDiagnostics();
		if (originalDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
		else process.env.PI_ORCHESTRATOR_DIR = originalDir;
		if (testDir) rmSync(testDir, { recursive: true, force: true });
		testDir = undefined;
	});

	function useTestDir(): string {
		testDir = mkdtempSync(join(tmpdir(), "maestro-o2-"));
		process.env.PI_ORCHESTRATOR_DIR = testDir;
		return testDir;
	}

	it("ignores an interrupted temporary write and keeps the atomic current manifest", () => {
		const directory = useTestDir();
		saveInstances([instance("current")]);
		writeFileSync(join(directory, "instances.json.999.interrupted.tmp"), "{", "utf8");
		assert.deepEqual(
			loadInstances().map(({ id }) => id),
			["current"],
		);
		assert.ok(readdirSync(directory).includes("instances.json.999.interrupted.tmp"));
	});

	it("recovers a valid bounded backup and reports corrupt current state", () => {
		useTestDir();
		saveInstances([instance("backup")]);
		saveInstances([instance("current")]);
		writeFileSync(getInstancesPath(), "{broken", "utf8");
		assert.deepEqual(
			loadInstances().map(({ id }) => id),
			["backup"],
		);
		assert.deepEqual(
			getStorageDiagnostics().map(({ code }) => code),
			["CURRENT_INVALID", "BACKUP_RECOVERED"],
		);
	});

	it("fails closed and observably when both current and backup are corrupt", () => {
		useTestDir();
		saveInstances([instance("backup")]);
		saveInstances([instance("current")]);
		writeFileSync(getInstancesPath(), "{broken", "utf8");
		writeFileSync(`${getInstancesPath()}.bak`, "[] trailing", "utf8");
		assert.throws(() => loadInstances(), OrchestratorStorageError);
		assert.deepEqual(
			getStorageDiagnostics().map(({ code }) => code),
			["CURRENT_INVALID", "BACKUP_INVALID", "STATE_UNRECOVERABLE"],
		);
	});

	it("validates schema and bounds before persisting records", () => {
		useTestDir();
		assert.throws(() => saveInstances([{ ...instance("invalid"), cwd: "x".repeat(4_097) }]), /Refusing to persist/);
		assert.throws(
			() => saveInstances([{ ...instance("invalid"), status: "invented" } as unknown as InstanceRecord]),
			/Refusing to persist/,
		);
	});

	it("retains terminal snapshots until expiry without dropping live records", () => {
		useTestDir();
		const completedAt = "2026-07-28T00:00:00.000Z";
		saveInstances([
			instance("succeeded", "succeeded", completedAt),
			instance("failed", "failed", completedAt),
			instance("cancelled", "cancelled", completedAt),
			instance("live", "online"),
		]);
		assert.deepEqual(
			loadInstances({ now: new Date("2026-07-28T00:00:00.500Z"), terminalRetentionMs: 1_000 }).map(({ id }) => id),
			["succeeded", "failed", "cancelled", "live"],
		);
		assert.deepEqual(
			loadInstances({ now: new Date("2026-07-28T00:00:01.001Z"), terminalRetentionMs: 1_000 }).map(({ id }) => id),
			["live"],
		);
	});

	it("persists an explicit stop as a retained cancelled terminal record", async () => {
		useTestDir();
		let disposed = false;
		const rpc: SupervisorRpcProcess = {
			processIdentity: { pid: process.pid, startReceipt: "storage-stop" },
			async send(command) {
				assert.equal(command.type, "get_state");
				return {
					type: "response",
					id: "state-1",
					command: "get_state",
					success: true,
					data: { sessionId: "session-1", sessionFile: "session.jsonl" },
				} as unknown as RpcResponse;
			},
			handleUiResponse() {},
			onEvent() {
				return () => undefined;
			},
			onExit() {
				return () => undefined;
			},
			setUiRequestHandler() {},
			async dispose() {
				disposed = true;
				return undefined;
			},
		};
		const supervisor = new OrchestratorSupervisor({
			createRpcProcess: () => rpc,
			presence: {
				async registerPi(record) {
					return record;
				},
				async disconnectPi() {},
			},
		});
		const running = await supervisor.spawnInstance({ cwd: process.cwd() });
		assert.equal(supervisor.getLifecycleStatus(running.id)?.state, "RUNNING");
		const stopped = await supervisor.stopInstance(running.id);
		assert.equal(disposed, true);
		assert.equal(supervisor.getLifecycleStatus(running.id)?.state, "CANCELLED");
		assert.equal(supervisor.getLifecycleResult(running.id)?.ready, true);
		const repeatedCancellation = await supervisor.cancelInstance(running.id);
		assert.equal(repeatedCancellation.completed, true);
		assert.equal(repeatedCancellation.alreadyTerminal, true);
		assert.equal(stopped?.status, "cancelled");
		assert.ok(stopped?.completedAt);
		assert.deepEqual(
			loadInstances().map(({ id, status, completedAt }) => ({ id, status, completedAt })),
			[{ id: running.id, status: "cancelled", completedAt: stopped?.completedAt }],
		);
	});

	it("records an unverified forced termination as failed", async () => {
		useTestDir();
		const rpc: SupervisorRpcProcess = {
			processIdentity: { pid: process.pid, startReceipt: "storage-force" },
			async send() {
				return {
					type: "response",
					id: "state-1",
					command: "get_state",
					success: true,
					data: { sessionId: "session-1" },
				} as unknown as RpcResponse;
			},
			handleUiResponse() {},
			onEvent() {
				return () => undefined;
			},
			onExit() {
				return () => undefined;
			},
			setUiRequestHandler() {},
			async dispose() {
				return { graceful: false, forced: true, exited: false };
			},
		};
		const supervisor = new OrchestratorSupervisor({
			createRpcProcess: () => rpc,
			presence: {
				async registerPi(record) {
					return record;
				},
				async disconnectPi() {},
			},
		});
		const running = await supervisor.spawnInstance({ cwd: process.cwd() });
		const stopped = await supervisor.stopInstance(running.id);
		assert.equal(stopped?.status, "failed");
		assert.deepEqual(stopped?.terminationOutcome, { graceful: false, forced: true, exited: false });
		assert.match(stopped?.terminalDiagnostic ?? "", /did not exit/);
	});

	it("bounds live sessions and begins shutdown of independent instances concurrently", async () => {
		assert.equal(DEFAULT_MAX_LIVE_INSTANCES, 10);
		useTestDir();
		let disposeStarted = 0;
		let releaseDisposals = (): void => undefined;
		const disposalGate = new Promise<void>((resolve) => {
			releaseDisposals = resolve;
		});
		const createRpcProcess = (): SupervisorRpcProcess => ({
			processIdentity: { pid: process.pid, startReceipt: `storage-bounded-${disposeStarted}` },
			async send() {
				return {
					type: "response",
					id: "state-1",
					command: "get_state",
					success: true,
					data: { sessionId: `session-${disposeStarted}` },
				} as unknown as RpcResponse;
			},
			handleUiResponse() {},
			onEvent() {
				return () => undefined;
			},
			onExit() {
				return () => undefined;
			},
			setUiRequestHandler() {},
			async dispose() {
				disposeStarted += 1;
				await disposalGate;
				return { graceful: true, forced: false, exited: true };
			},
		});
		const presence = {
			async registerPi(record: InstanceRecord) {
				return record;
			},
			async disconnectPi() {},
		};
		const bounded = new OrchestratorSupervisor({ createRpcProcess, presence, maxLiveInstances: 1 });
		const only = await bounded.spawnInstance({ cwd: process.cwd() });
		await assert.rejects(bounded.spawnInstance({ cwd: process.cwd() }), /live instance limit/);
		releaseDisposals();
		await bounded.stopInstance(only.id);

		disposeStarted = 0;
		let releaseParallel = (): void => undefined;
		const parallelGate = new Promise<void>((resolve) => {
			releaseParallel = resolve;
		});
		const parallel = new OrchestratorSupervisor({
			maxLiveInstances: 2,
			presence,
			createRpcProcess: () => {
				const rpc = createRpcProcess();
				return {
					...rpc,
					async dispose() {
						disposeStarted += 1;
						await parallelGate;
						return { graceful: true, forced: false, exited: true };
					},
				};
			},
		});
		await parallel.spawnInstance({ cwd: process.cwd() });
		await parallel.spawnInstance({ cwd: process.cwd() });
		const shutdown = parallel.shutdown();
		await nextTurn();
		assert.equal(disposeStarted, 2);
		releaseParallel();
		await shutdown;
	});

	it("rejects PID reuse unless the independently observed start receipt matches", () => {
		const expected = { pid: 4242, startReceipt: "start-a" };
		assert.equal(verifyProcessIdentity(expected, undefined), false);
		assert.equal(verifyProcessIdentity(expected, { pid: 4242, startReceipt: "start-b" }), false);
		assert.equal(verifyProcessIdentity(expected, { pid: 4243, startReceipt: "start-a" }), false);
		assert.equal(verifyProcessIdentity(expected, { pid: 4242, startReceipt: "start-a" }), true);
	});
});
