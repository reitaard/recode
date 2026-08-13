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
import { saveInstances } from "../src/storage.ts";
import { InteractiveOwnerAttachedError, OrchestratorSupervisor, type SupervisorRpcProcess } from "../src/supervisor.ts";
import type { InstanceRecord, ProcessIdentityRecord } from "../src/types.ts";
import { inspectWorkspaceOwnership } from "../src/workspace-safety.ts";

class AttachedRpcProcess implements SupervisorRpcProcess {
	readonly processIdentity?: ProcessIdentityRecord;
	readonly uiResponses: RpcExtensionUIResponse[] = [];
	disposeCount = 0;
	detachCount = 0;
	sessionId: string;
	sessionFile: string;
	private readonly eventListeners = new Set<AgentSessionEventListener>();
	private uiHandler: ((request: RpcExtensionUIRequest) => void) | undefined;

	constructor(
		sessionId = "session-1",
		processIdentity: ProcessIdentityRecord = { pid: process.pid, startReceipt: `attached-${sessionId}` },
	) {
		this.sessionId = sessionId;
		this.sessionFile = `${sessionId}.jsonl`;
		this.processIdentity = processIdentity;
	}

	async send(command: RpcCommand): Promise<RpcResponse> {
		if (command.type === "get_state") {
			return {
				type: "response",
				id: command.id,
				command: "get_state",
				success: true,
				data: { sessionId: this.sessionId, sessionFile: this.sessionFile },
			} as unknown as RpcResponse;
		}
		if (command.type === "prompt") {
			return { type: "response", id: command.id, command: "prompt", success: true };
		}
		return { type: "response", id: command.id, command: command.type, success: true } as unknown as RpcResponse;
	}

	handleUiResponse(response: RpcExtensionUIResponse): void {
		this.uiResponses.push(response);
	}

	onEvent(listener: AgentSessionEventListener): () => void {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	}

	onExit(_listener: (error?: Error) => void): () => void {
		return () => undefined;
	}

	setUiRequestHandler(handler: ((request: RpcExtensionUIRequest) => void) | undefined): void {
		this.uiHandler = handler;
	}

	async dispose(): Promise<undefined> {
		this.disposeCount += 1;
		return undefined;
	}

	async detach(): Promise<void> {
		this.detachCount += 1;
	}

	emit(event: AgentSessionEvent): void {
		for (const listener of this.eventListeners) listener(event);
	}

	emitUi(request: RpcExtensionUIRequest): void {
		this.uiHandler?.(request);
	}
}

const presence = {
	async registerPi(record: InstanceRecord): Promise<InstanceRecord> {
		return record;
	},
	async disconnectPi(): Promise<void> {},
};

describe("Maestro attach, detach, and replay", () => {
	const originalDir = process.env.PI_ORCHESTRATOR_DIR;
	let testDir: string | undefined;

	afterEach(() => {
		if (originalDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
		else process.env.PI_ORCHESTRATOR_DIR = originalDir;
		if (testDir) rmSync(testDir, { recursive: true, force: true });
		testDir = undefined;
	});

	function setup(options: { maxEventTailEntries?: number } = {}): {
		supervisor: OrchestratorSupervisor;
		process: AttachedRpcProcess;
	} {
		testDir = mkdtempSync(join(tmpdir(), "maestro-o5-"));
		process.env.PI_ORCHESTRATOR_DIR = testDir;
		const rpcProcess = new AttachedRpcProcess();
		return {
			process: rpcProcess,
			supervisor: new OrchestratorSupervisor({
				createRpcProcess: () => rpcProcess,
				presence,
				maxEventTailEntries: options.maxEventTailEntries,
			}),
		};
	}

	it("allows one interactive owner, permits read-only subscribers, and detaches non-destructively", async () => {
		const { supervisor, process: rpcProcess } = setup();
		const instance = await supervisor.spawnInstance({ cwd: process.cwd() });
		const first = supervisor.openRpcStream(
			instance.id,
			() => undefined,
			() => undefined,
			{
				ownerId: "owner-1",
			},
		);
		assert.ok(first);
		assert.equal(first.attachment.ownerGeneration, 1);
		assert.throws(
			() =>
				supervisor.openRpcStream(
					instance.id,
					() => undefined,
					() => undefined,
					{ ownerId: "owner-2" },
				),
			InteractiveOwnerAttachedError,
		);
		const observer = supervisor.openRpcStream(
			instance.id,
			() => undefined,
			() => undefined,
			{ mode: "read-only" },
		);
		assert.ok(observer);
		assert.equal((await observer.handleRpc({ type: "get_state" })).success, true);
		await assert.rejects(observer.handleRpc({ type: "prompt", message: "write" }), /requires the interactive owner/);
		first.close();
		assert.equal(rpcProcess.disposeCount, 0);
		await assert.rejects(
			supervisor.handleRpc(instance.id, { type: "prompt", message: "detached mutation" }),
			/attached interactive approval owner/,
		);
		const second = supervisor.openRpcStream(
			instance.id,
			() => undefined,
			() => undefined,
			{
				ownerId: "owner-2",
			},
		);
		assert.ok(second);
		assert.equal(second.attachment.ownerGeneration, 2);
		first.close();
		assert.throws(
			() =>
				supervisor.openRpcStream(
					instance.id,
					() => undefined,
					() => undefined,
					{ ownerId: "owner-3" },
				),
			InteractiveOwnerAttachedError,
		);
		observer.close();
		second.close();
		await supervisor.shutdown();
	});

	it("reports detached blocking input and replays bounded events plus the pending request", async () => {
		const { supervisor, process: rpcProcess } = setup({ maxEventTailEntries: 2 });
		const instance = await supervisor.spawnInstance({ cwd: process.cwd() });
		const owner = supervisor.openRpcStream(
			instance.id,
			() => undefined,
			() => undefined,
			{ ownerId: "owner-1" },
		);
		assert.ok(owner);
		const request: RpcExtensionUIRequest = {
			type: "extension_ui_request",
			id: "ui-1",
			method: "input",
			title: "Approval",
		};
		rpcProcess.emitUi(request);
		assert.equal(supervisor.getLifecycleStatus(instance.id)?.state, "WAITING_INPUT");
		owner.close();
		assert.equal(supervisor.getInstance(instance.id)?.status, "waiting-input");
		for (let index = 0; index < 4; index += 1) rpcProcess.emit({ type: "agent_settled" });
		const reattached = supervisor.openRpcStream(
			instance.id,
			() => undefined,
			() => undefined,
			{
				ownerId: "owner-2",
			},
		);
		assert.ok(reattached);
		assert.equal(supervisor.getInstance(instance.id)?.status, "online");
		assert.equal(reattached.replay.events.length, 2);
		assert.equal(reattached.replay.pendingUiRequest?.id, "ui-1");
		assert.throws(
			() => reattached.handleUiResponse({ type: "extension_ui_response", id: "stale", value: "no" }),
			/pending request/,
		);
		reattached.handleUiResponse({ type: "extension_ui_response", id: "ui-1", value: "approved" });
		assert.equal(rpcProcess.uiResponses.length, 1);
		assert.equal(supervisor.getLifecycleStatus(instance.id)?.state, "RUNNING");
		reattached.close();
		assert.equal(supervisor.getInstance(instance.id)?.status, "online");
		await supervisor.shutdown();
	});
});

describe("Maestro verified restart reconnect", () => {
	const originalDir = process.env.PI_ORCHESTRATOR_DIR;
	let testDir: string | undefined;

	afterEach(() => {
		if (originalDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
		else process.env.PI_ORCHESTRATOR_DIR = originalDir;
		if (testDir) rmSync(testDir, { recursive: true, force: true });
		testDir = undefined;
	});

	function persistLive(identity: ProcessIdentityRecord): InstanceRecord {
		testDir = mkdtempSync(join(tmpdir(), "maestro-o5-reconnect-"));
		process.env.PI_ORCHESTRATOR_DIR = testDir;
		const workspaceReceipt = inspectWorkspaceOwnership(process.cwd(), "read-only", "persisted-instance");
		const instance: InstanceRecord = {
			id: "persisted-instance",
			status: "online",
			cwd: workspaceReceipt.selectedPath,
			workspaceReceipt,
			createdAt: "2026-07-28T00:00:00.000Z",
			lastSeenAt: "2026-07-28T00:00:00.000Z",
			sessionId: "session-1",
			sessionFile: "session-1.jsonl",
			processIdentity: identity,
		};
		saveInstances([instance]);
		return instance;
	}

	it("adopts only a process and session with matching independent receipts", async () => {
		const identity = { pid: 4242, startReceipt: "process-start-1" };
		const persisted = persistLive(identity);
		saveInstances([
			{
				...persisted,
				status: "online",
				pendingUiRequest: {
					type: "extension_ui_request",
					id: "persisted-ui",
					method: "confirm",
					title: "Resume",
					message: "Continue?",
				},
			},
		]);
		const rpcProcess = new AttachedRpcProcess("session-1", identity);
		const supervisor = new OrchestratorSupervisor({
			presence,
			inspectProcessIdentity: async () => ({ ...identity }),
			reconnectRpcProcess: async () => rpcProcess,
		});
		await supervisor.recoverAfterRestart();
		assert.equal(supervisor.getLiveInstance("persisted-instance")?.status, "waiting-input");
		assert.equal(supervisor.getLifecycleStatus("persisted-instance")?.state, "WAITING_INPUT");
		const attached = supervisor.openRpcStream(
			"persisted-instance",
			() => undefined,
			() => undefined,
			{
				ownerId: "reconnected-owner",
			},
		);
		assert.ok(attached);
		assert.equal(attached.replay.pendingUiRequest?.id, "persisted-ui");
		assert.equal(supervisor.getLiveInstance("persisted-instance")?.status, "online");
		attached.close();
		assert.equal(supervisor.getLiveInstance("persisted-instance")?.status, "waiting-input");
		assert.equal(rpcProcess.detachCount, 0);
		await supervisor.shutdown();
	});

	it("refuses session mismatch without killing or adopting the process", async () => {
		const identity = { pid: 4242, startReceipt: "process-start-1" };
		persistLive(identity);
		const rpcProcess = new AttachedRpcProcess("different-session", identity);
		const supervisor = new OrchestratorSupervisor({
			presence,
			inspectProcessIdentity: async () => ({ ...identity }),
			reconnectRpcProcess: async () => rpcProcess,
		});
		await supervisor.recoverAfterRestart();
		assert.equal(supervisor.getLiveInstance("persisted-instance"), undefined);
		assert.equal(supervisor.getInstance("persisted-instance")?.status, "stopped");
		assert.match(
			supervisor.getInstance("persisted-instance")?.terminalDiagnostic ?? "",
			/session identity receipt mismatch/,
		);
		assert.equal(rpcProcess.detachCount, 1);
		assert.equal(rpcProcess.disposeCount, 0);
	});
});
