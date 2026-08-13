import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import type {
	AgentSessionEventListener,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@reitaard/recode-coding-agent";
import { OrchestratorSupervisor, type SupervisorRpcProcess } from "../src/supervisor.ts";
import type { InstanceRecord, WorkspaceAccessMode, WorkspaceOwnershipReceipt } from "../src/types.ts";
import {
	assertWorkspaceAdmission,
	inspectWorkspaceOwnership,
	verifyWorkspaceOwnershipReceipt,
	WorkspaceSafetyError,
} from "../src/workspace-safety.ts";

function receipt(
	ownerInstanceId: string,
	access: WorkspaceAccessMode,
	worktreeIdentity: string,
	gitCommonDir = "/repo/.git",
): WorkspaceOwnershipReceipt {
	return {
		schemaVersion: 1,
		ownerInstanceId,
		access,
		selectedPath: `/repo/${worktreeIdentity}`,
		worktreeRoot: `/repo/${worktreeIdentity}`,
		gitCommonDir,
		worktreeIdentity: worktreeIdentity.padEnd(64, "0").slice(0, 64),
		branch: worktreeIdentity,
		selectedAt: "2026-07-28T12:00:00.000Z",
		managed: false,
	};
}

function activeRecord(workspaceReceipt?: WorkspaceOwnershipReceipt): InstanceRecord {
	return {
		id: workspaceReceipt?.ownerInstanceId ?? "legacy-owner",
		status: "online",
		cwd: workspaceReceipt?.selectedPath ?? "/legacy",
		createdAt: "2026-07-28T12:00:00.000Z",
		workspaceReceipt,
	};
}

class WorkspaceRpcProcess implements SupervisorRpcProcess {
	readonly commands: RpcCommand[] = [];
	readonly processIdentity;
	private readonly sessionId: string;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
		this.processIdentity = { pid: process.pid, startReceipt: `workspace-${sessionId}` };
	}

	async send(command: RpcCommand): Promise<RpcResponse> {
		this.commands.push(command);
		if (command.type === "get_state") {
			return {
				type: "response",
				command: "get_state",
				success: true,
				data: { sessionId: this.sessionId, sessionFile: `${this.sessionId}.jsonl` },
			} as unknown as RpcResponse;
		}
		return { type: "response", command: command.type, success: true } as unknown as RpcResponse;
	}
	handleUiResponse(_response: RpcExtensionUIResponse): void {}
	onEvent(_listener: AgentSessionEventListener): () => void {
		return () => undefined;
	}
	onExit(_listener: (error?: Error) => void): () => void {
		return () => undefined;
	}
	setUiRequestHandler(_handler: ((request: RpcExtensionUIRequest) => void) | undefined): void {}
	async dispose(): Promise<undefined> {
		return undefined;
	}
}

const presence = {
	async registerPi(record: InstanceRecord): Promise<InstanceRecord> {
		return record;
	},
	async disconnectPi(): Promise<void> {},
};

describe("Maestro workspace safety", () => {
	const originalDir = process.env.PI_ORCHESTRATOR_DIR;
	let testDir: string | undefined;

	afterEach(() => {
		if (originalDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
		else process.env.PI_ORCHESTRATOR_DIR = originalDir;
		if (testDir) rmSync(testDir, { recursive: true, force: true });
		testDir = undefined;
	});

	it("creates an unmanaged canonical receipt and detects identity drift", () => {
		const observed = inspectWorkspaceOwnership(process.cwd(), "write", "instance-1");
		assert.equal(observed.schemaVersion, 1);
		assert.equal(observed.ownerInstanceId, "instance-1");
		assert.equal(observed.managed, false);
		assert.match(observed.worktreeIdentity, /^[a-f0-9]{64}$/);
		assert.equal(verifyWorkspaceOwnershipReceipt(observed), true);
		assert.equal(verifyWorkspaceOwnershipReceipt({ ...observed, worktreeIdentity: "f".repeat(64) }), false);
	});

	it("allows shared read-only access but rejects shared or ambiguous writers", () => {
		const writer = receipt("writer-1", "write", "worktree-a");
		assert.doesNotThrow(() =>
			assertWorkspaceAdmission(receipt("reader-1", "read-only", "worktree-a"), [activeRecord(writer)]),
		);
		assert.throws(
			() =>
				assertWorkspaceAdmission(
					receipt("reader-2", "read-only", "worktree-a"),
					[activeRecord(writer)],
					"missing-parent",
				),
			(error: unknown) => error instanceof WorkspaceSafetyError && error.code === "PARENT_NOT_FOUND",
		);
		assert.throws(
			() => assertWorkspaceAdmission(receipt("writer-2", "write", "worktree-a"), [activeRecord(writer)]),
			(error: unknown) => error instanceof WorkspaceSafetyError && error.code === "SHARED_WRITE_WORKSPACE",
		);
		assert.throws(
			() => assertWorkspaceAdmission(receipt("writer-2", "write", "worktree-b"), [activeRecord()]),
			(error: unknown) => error instanceof WorkspaceSafetyError && error.code === "AMBIGUOUS_EXISTING_OWNER",
		);
	});

	it("requires a write-capable child to use a sibling worktree from the parent's repository", () => {
		const parent = receipt("parent", "write", "worktree-a");
		assert.doesNotThrow(() =>
			assertWorkspaceAdmission(receipt("child", "write", "worktree-b"), [activeRecord(parent)], "parent"),
		);
		for (const candidate of [
			receipt("child", "write", "worktree-a"),
			receipt("child", "write", "worktree-b", "/foreign/.git"),
		]) {
			assert.throws(
				() => assertWorkspaceAdmission(candidate, [activeRecord(parent)], "parent"),
				(error: unknown) =>
					error instanceof WorkspaceSafetyError && error.code === "WRITE_CHILD_REQUIRES_SIBLING_WORKTREE",
			);
		}
	});

	it("persists receipts, disables tools for readers, and blocks mutating reader RPC", async () => {
		testDir = mkdtempSync(join(tmpdir(), "maestro-o7-"));
		process.env.PI_ORCHESTRATOR_DIR = testDir;
		const launched: Array<{ cwd: string; workspaceAccess: WorkspaceAccessMode }> = [];
		let sequence = 0;
		const supervisor = new OrchestratorSupervisor({
			createRpcProcess: (options) => {
				launched.push(options);
				sequence += 1;
				return new WorkspaceRpcProcess(`session-${sequence}`);
			},
			presence,
		});
		const writer = await supervisor.spawnInstance({ cwd: process.cwd(), workspaceAccess: "write" });
		const reader = await supervisor.spawnInstance({ cwd: process.cwd(), workspaceAccess: "read-only" });
		assert.equal(writer.workspaceReceipt?.access, "write");
		assert.equal(reader.workspaceReceipt?.access, "read-only");
		assert.equal(reader.workspaceReceipt?.managed, false);
		assert.deepEqual(
			launched.map((entry) => entry.workspaceAccess),
			["write", "read-only"],
		);
		await assert.rejects(supervisor.handleRpc(reader.id, { type: "bash", command: "echo unsafe" }), /read-only/);
		await assert.rejects(
			supervisor.handleRpc(reader.id, { type: "prompt", message: "/extension-command" }),
			/read-only/,
		);
		await assert.rejects(
			supervisor.spawnInstance({ cwd: process.cwd(), workspaceAccess: "write" }),
			/selected worktree/,
		);
		await supervisor.shutdown();
	});
});
