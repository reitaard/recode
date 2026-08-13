import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import type {
	AgentSessionEvent,
	AgentSessionEventListener,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@reitaard/recode-coding-agent";
import { OrchestratorSupervisor, type SupervisorRpcProcess } from "../src/supervisor.ts";
import { SessionTurnLeaseRegistry, TurnLeaseTimeoutError } from "../src/turn-lease.ts";
import type { InstanceRecord } from "../src/types.ts";

class FakeRpcProcess implements SupervisorRpcProcess {
	sessionId: string;
	readonly processIdentity;
	readonly prompts: string[] = [];
	private readonly eventListeners = new Set<AgentSessionEventListener>();

	constructor(sessionId: string) {
		this.sessionId = sessionId;
		this.processIdentity = { pid: process.pid, startReceipt: `turn-lease-${sessionId}` };
	}

	async send(command: RpcCommand): Promise<RpcResponse> {
		if (command.type === "get_state") {
			return {
				type: "response",
				id: command.id,
				command: "get_state",
				success: true,
				data: { sessionId: this.sessionId, sessionFile: `${this.sessionId}.jsonl` },
			} as unknown as RpcResponse;
		}
		if (command.type === "prompt") {
			this.prompts.push(command.message);
			return { type: "response", id: command.id, command: "prompt", success: true };
		}
		return { type: "response", id: command.id, command: command.type, success: true } as unknown as RpcResponse;
	}

	handleUiResponse(_response: RpcExtensionUIResponse): void {}

	onEvent(listener: AgentSessionEventListener): () => void {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	}

	onExit(_listener: (error?: Error) => void): () => void {
		return () => undefined;
	}

	setUiRequestHandler(_handler: ((request: RpcExtensionUIRequest) => void) | undefined): void {}

	async dispose(): Promise<undefined> {
		return undefined;
	}

	emit(event: AgentSessionEvent): void {
		for (const listener of this.eventListeners) listener(event);
	}
}

async function nextTurn(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

const presence = {
	async registerPi(record: InstanceRecord): Promise<InstanceRecord> {
		return record;
	},
	async disconnectPi(): Promise<void> {},
};

describe("supervisor durable-session turn leases", () => {
	const originalDir = process.env.PI_ORCHESTRATOR_DIR;
	let testDir: string | undefined;

	afterEach(() => {
		if (originalDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
		else process.env.PI_ORCHESTRATOR_DIR = originalDir;
		if (testDir) rmSync(testDir, { recursive: true, force: true });
		testDir = undefined;
	});

	function setup(
		sessionIds: string[],
		timeoutMs = 100,
	): {
		supervisor: OrchestratorSupervisor;
		processes: FakeRpcProcess[];
	} {
		testDir = mkdtempSync(join(tmpdir(), "maestro-o4-"));
		process.env.PI_ORCHESTRATOR_DIR = testDir;
		const processes = sessionIds.map((sessionId) => new FakeRpcProcess(sessionId));
		let processIndex = 0;
		return {
			processes,
			supervisor: new OrchestratorSupervisor({
				createRpcProcess: () => processes[processIndex++]!,
				presence,
				turnLeaseRegistry: new SessionTurnLeaseRegistry({ defaultTimeoutMs: timeoutMs }),
				turnLeaseTimeoutMs: timeoutMs,
			}),
		};
	}

	function attach(supervisor: OrchestratorSupervisor, instanceId: string, ownerId: string) {
		return supervisor.openRpcStream(
			instanceId,
			() => undefined,
			() => undefined,
			{ ownerId },
		)!;
	}

	it("serializes prompts from alias instances while allowing read-only state", async () => {
		const { supervisor, processes } = setup(["shared-session", "shared-session"]);
		const first = await supervisor.spawnInstance({ cwd: process.cwd() });
		const second = await supervisor.spawnInstance({ cwd: process.cwd() });
		const firstOwner = attach(supervisor, first.id, "owner-a");
		const secondOwner = attach(supervisor, second.id, "owner-b");
		await firstOwner.handleRpc({ id: "prompt-a", type: "prompt", message: "first" });
		const waiting = secondOwner.handleRpc({ id: "prompt-b", type: "prompt", message: "second" });
		await nextTurn();
		assert.deepEqual(processes[1]!.prompts, []);
		assert.equal((await supervisor.handleRpc(second.id, { type: "get_state" }))?.success, true);
		processes[0]!.emit({ type: "agent_settled" });
		await waiting;
		assert.deepEqual(processes[1]!.prompts, ["second"]);
		processes[1]!.emit({ type: "agent_settled" });
		firstOwner.close();
		secondOwner.close();
		await supervisor.shutdown();
	});

	it("rebinds the held lease when compaction rotates the durable session", async () => {
		const { supervisor, processes } = setup(["parent-session", "child-session"]);
		const first = await supervisor.spawnInstance({ cwd: process.cwd() });
		const second = await supervisor.spawnInstance({ cwd: process.cwd() });
		const firstOwner = attach(supervisor, first.id, "owner-a");
		const secondOwner = attach(supervisor, second.id, "owner-b");
		await firstOwner.handleRpc({ id: "prompt-a", type: "prompt", message: "first" });
		processes[0]!.sessionId = "child-session";
		processes[0]!.emit({
			type: "compaction_end",
			reason: "threshold",
			result: undefined,
			aborted: false,
			willRetry: false,
		});
		await nextTurn();
		const waiting = secondOwner.handleRpc({ id: "prompt-b", type: "prompt", message: "second" });
		await nextTurn();
		assert.deepEqual(processes[1]!.prompts, []);
		processes[0]!.emit({ type: "agent_settled" });
		await waiting;
		assert.deepEqual(processes[1]!.prompts, ["second"]);
		processes[1]!.emit({ type: "agent_settled" });
		firstOwner.close();
		secondOwner.close();
		await supervisor.shutdown();
	});

	it("fails closed on lease timeout and leaves the authoritative turn running", async () => {
		const { supervisor, processes } = setup(["shared-session", "shared-session"], 10);
		const first = await supervisor.spawnInstance({ cwd: process.cwd() });
		const second = await supervisor.spawnInstance({ cwd: process.cwd() });
		const firstOwner = attach(supervisor, first.id, "owner-a");
		const secondOwner = attach(supervisor, second.id, "owner-b");
		await firstOwner.handleRpc({ id: "prompt-a", type: "prompt", message: "first" });
		await assert.rejects(
			secondOwner.handleRpc({ id: "prompt-b", type: "prompt", message: "second" }),
			TurnLeaseTimeoutError,
		);
		assert.deepEqual(processes[1]!.prompts, []);
		processes[0]!.emit({ type: "agent_settled" });
		firstOwner.close();
		secondOwner.close();
		await supervisor.shutdown();
	});
});
