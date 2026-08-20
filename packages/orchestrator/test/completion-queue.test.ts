import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type {
	AgentSessionEvent,
	AgentSessionEventListener,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@reitaard/recode-coding-agent";
import { type CompletionQueueStorage, MaestroCompletionQueue } from "../src/completion-queue.ts";
import { type MaestroLifecycleAdapter, MaestroLifecycleService } from "../src/lifecycle-service.ts";
import { loadInstances, saveInstances } from "../src/storage.ts";
import { OrchestratorSupervisor, type SupervisorRpcProcess } from "../src/supervisor.ts";
import type { CompletionRecord, InstanceRecord } from "../src/types.ts";

class MemoryCompletionStorage implements CompletionQueueStorage {
	records: CompletionRecord[] = [];

	load(): CompletionRecord[] {
		return this.records.map((record) => ({ ...record }));
	}

	save(records: CompletionRecord[]): void {
		this.records = records.map((record) => ({ ...record }));
	}
}

const baseCompletion = {
	parentInstanceId: "parent-1",
	parentSessionId: "parent-session",
	childInstanceId: "child-1",
	childSessionId: "child-session",
	terminalState: "SUCCEEDED" as const,
	summary: "Completed bounded work.",
	resultHash: "a".repeat(64),
	completedAt: "2026-07-28T12:00:00.000Z",
};

class FakeParentRpcProcess implements SupervisorRpcProcess {
	readonly processIdentity;
	readonly sessionId: string;
	mode: "busy" | "deliver" = "deliver";
	deliveryAttempts = 0;
	private readonly listeners = new Set<AgentSessionEventListener>();
	private readonly exitListeners = new Set<(error?: Error) => void>();

	constructor(sessionId = "parent-session") {
		this.sessionId = sessionId;
		this.processIdentity = { pid: process.pid, startReceipt: `completion-${sessionId}` };
	}

	async send(command: RpcCommand): Promise<RpcResponse> {
		if (command.type === "get_state") {
			return {
				type: "response",
				command: "get_state",
				success: true,
				data: { sessionId: this.sessionId, sessionFile: `${this.sessionId}.jsonl` },
			} as unknown as RpcResponse;
		}
		if (command.type === "maestro_completion_handoff") {
			this.deliveryAttempts += 1;
			return {
				type: "response",
				command: "maestro_completion_handoff",
				success: true,
				data:
					this.mode === "busy"
						? { delivered: false, duplicate: false, retryable: true }
						: { delivered: true, duplicate: false, retryable: false },
			};
		}
		return { type: "response", command: command.type, success: true } as unknown as RpcResponse;
	}

	handleUiResponse(_response: RpcExtensionUIResponse): void {}
	onEvent(listener: AgentSessionEventListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	onExit(listener: (error?: Error) => void): () => void {
		this.exitListeners.add(listener);
		return () => this.exitListeners.delete(listener);
	}
	setUiRequestHandler(_handler: ((request: RpcExtensionUIRequest) => void) | undefined): void {}
	async dispose(): Promise<undefined> {
		return undefined;
	}
	emit(event: AgentSessionEvent): void {
		for (const listener of this.listeners) listener(event);
	}
	emitExit(error?: Error): void {
		for (const listener of this.exitListeners) listener(error);
	}
}

const presence = {
	async registerPi(record: InstanceRecord): Promise<InstanceRecord> {
		return record;
	},
	async disconnectPi(): Promise<void> {},
};

describe("Maestro completion queue", () => {
	it("persists idempotently and refuses to evict an unacknowledged completion at capacity", () => {
		const storage = new MemoryCompletionStorage();
		const queue = new MaestroCompletionQueue({ storage, maxEntries: 1 });
		const first = queue.enqueue(baseCompletion);
		const repeated = new MaestroCompletionQueue({ storage, maxEntries: 1 }).enqueue(baseCompletion);
		assert.equal(repeated.id, first.id);
		assert.throws(
			() =>
				queue.enqueue({
					...baseCompletion,
					childInstanceId: "child-2",
					resultHash: "b".repeat(64),
				}),
			/refusing to drop an unacknowledged completion/,
		);
		assert.equal(storage.records.length, 1);
	});

	it("uses generation-safe claims and idempotent acknowledgement across queue reconstruction", () => {
		const storage = new MemoryCompletionStorage();
		let nowMs = Date.parse("2026-07-28T12:00:01.000Z");
		const options = { storage, claimLeaseMs: 10, now: () => new Date(nowMs) };
		const queue = new MaestroCompletionQueue(options);
		queue.enqueue(baseCompletion);
		const first = queue.claim({ instanceId: "parent-1", sessionId: "parent-session" }, "owner-a")[0]!;
		assert.equal(
			new MaestroCompletionQueue(options).claim(
				{ instanceId: "parent-1", sessionId: "parent-session" },
				"foreign-owner",
			).length,
			0,
		);
		const second = new MaestroCompletionQueue(options).claim(
			{ instanceId: "parent-1", sessionId: "parent-session" },
			"owner-a",
		)[0]!;
		assert.equal(second.generation, first.generation + 1);
		assert.equal(queue.acknowledge(first), false);
		nowMs += 11;
		const third = new MaestroCompletionQueue(options).claim(
			{ instanceId: "parent-1", sessionId: "parent-session" },
			"owner-b",
		)[0]!;
		assert.equal(queue.acknowledge(second), false);
		assert.equal(queue.acknowledge(third), true);
		assert.equal(queue.acknowledge(third), true);
		assert.equal(storage.records[0]?.deliveryState, "acknowledged");
	});

	it("records lifecycle completion before reporting the handoff as queued", async () => {
		const storage = new MemoryCompletionStorage();
		const queue = new MaestroCompletionQueue({ storage });
		const adapter: MaestroLifecycleAdapter = {
			kind: "worker",
			async launch(_request, control) {
				control.transition("RUNNING");
				return { state: "SUCCEEDED", summary: "Worker summary" };
			},
		};
		const service = new MaestroLifecycleService({ adapters: [adapter], completionQueue: queue });
		const handle = service.launch({
			kind: "worker",
			goal: "bounded task",
			role: "audit",
			cwd: process.cwd(),
			workspaceAccess: "read-only",
			parentInstanceId: "parent-1",
			parentSessionId: "parent-session",
		});
		await service.wait(handle);
		const result = service.result(handle);
		assert.equal(result.handoffState, "queued");
		assert.equal(storage.records[0]?.childInstanceId, handle.instanceId);
		assert.equal(storage.records[0]?.resultHash, result.resultHash);
	});

	it("recovers crash windows before and after durable enqueue", async () => {
		const originalDir = process.env.PI_ORCHESTRATOR_DIR;
		const testDir = mkdtempSync(join(tmpdir(), "maestro-o6-recovery-"));
		process.env.PI_ORCHESTRATOR_DIR = testDir;
		try {
			const storage = new MemoryCompletionStorage();
			const queue = new MaestroCompletionQueue({ storage });
			const terminal: InstanceRecord = {
				id: "recovered-child",
				status: "failed",
				cwd: process.cwd(),
				createdAt: new Date(Date.now() - 2_000).toISOString(),
				completedAt: new Date(Date.now() - 1_000).toISOString(),
				parentSessionId: "recovered-parent",
				sessionId: "recovered-child-session",
				terminalState: "FAILED",
				terminalSummary: "Child failed",
				terminalResultHash: "c".repeat(64),
			};
			saveInstances([terminal]);
			const supervisor = new OrchestratorSupervisor({ presence, completionQueue: queue });
			await supervisor.recoverAfterRestart();
			assert.equal(storage.records.length, 1);
			assert.ok(loadInstances()[0]?.completionQueuedAt);

			// Simulate a crash after queue persistence but before the instance outbox marker.
			saveInstances([terminal]);
			await new OrchestratorSupervisor({ presence, completionQueue: queue }).recoverAfterRestart();
			assert.equal(storage.records.length, 1);
			assert.ok(loadInstances()[0]?.completionQueuedAt);
		} finally {
			if (originalDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
			else process.env.PI_ORCHESTRATOR_DIR = originalDir;
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("creates one durable completion from a real child terminal transition", async () => {
		const originalDir = process.env.PI_ORCHESTRATOR_DIR;
		const testDir = mkdtempSync(join(tmpdir(), "maestro-o6-producer-"));
		process.env.PI_ORCHESTRATOR_DIR = testDir;
		try {
			const storage = new MemoryCompletionStorage();
			const queue = new MaestroCompletionQueue({ storage });
			const parentRpc = new FakeParentRpcProcess("parent-session");
			const childRpc = new FakeParentRpcProcess("child-session");
			const processes = [parentRpc, childRpc];
			const supervisor = new OrchestratorSupervisor({
				createRpcProcess: () => processes.shift()!,
				presence,
				completionQueue: queue,
			});
			const parent = await supervisor.spawnInstance({ cwd: process.cwd() });
			const child = await supervisor.spawnInstance({
				cwd: process.cwd(),
				parentInstanceId: parent.id,
				parentSessionId: parent.sessionId,
			});
			childRpc.emitExit(new Error("child crashed"));
			await new Promise<void>((resolve) => setImmediate(resolve));
			await supervisor.deliverCompletions(parent.id);
			assert.equal(storage.records.length, 1);
			assert.equal(storage.records[0]?.childInstanceId, child.id);
			assert.equal(storage.records[0]?.terminalState, "FAILED");
			assert.equal(storage.records[0]?.deliveryState, "acknowledged");
			assert.equal(supervisor.getLifecycleResult(child.id)?.handoffState, "queued");
			assert.equal(supervisor.getLifecycleResult(child.id)?.resultHash, storage.records[0]?.resultHash);
			childRpc.emitExit(new Error("duplicate exit"));
			await new Promise<void>((resolve) => setImmediate(resolve));
			assert.equal(storage.records.length, 1);
			await supervisor.shutdown();
		} finally {
			if (originalDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
			else process.env.PI_ORCHESTRATOR_DIR = originalDir;
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("delivers only at a safe parent boundary and acknowledges without replay", async () => {
		const originalDir = process.env.PI_ORCHESTRATOR_DIR;
		const testDir = mkdtempSync(join(tmpdir(), "maestro-o6-"));
		process.env.PI_ORCHESTRATOR_DIR = testDir;
		try {
			const storage = new MemoryCompletionStorage();
			const queue = new MaestroCompletionQueue({ storage });
			const rpcProcess = new FakeParentRpcProcess();
			const supervisor = new OrchestratorSupervisor({
				createRpcProcess: () => rpcProcess,
				presence,
				completionQueue: queue,
			});
			const parent = await supervisor.spawnInstance({ cwd: process.cwd() });
			rpcProcess.mode = "busy";
			supervisor.enqueueCompletion({ ...baseCompletion, parentInstanceId: parent.id });
			await supervisor.deliverCompletions(parent.id);
			assert.equal(storage.records[0]?.deliveryState, "pending");

			rpcProcess.mode = "deliver";
			rpcProcess.emit({ type: "agent_settled" });
			await supervisor.deliverCompletions(parent.id);
			assert.equal(storage.records[0]?.deliveryState, "acknowledged");
			const attemptsAfterAck = rpcProcess.deliveryAttempts;
			await supervisor.deliverCompletions(parent.id);
			assert.equal(rpcProcess.deliveryAttempts, attemptsAfterAck);
			await supervisor.shutdown();
		} finally {
			if (originalDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
			else process.env.PI_ORCHESTRATOR_DIR = originalDir;
			rmSync(testDir, { recursive: true, force: true });
		}
	});
});
