import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { InstanceRecord, WorkspaceAccessMode, WorkspaceOwnershipReceipt } from "./types.ts";

export class WorkspaceSafetyError extends Error {
	readonly code:
		| "AMBIGUOUS_EXISTING_OWNER"
		| "PARENT_NOT_FOUND"
		| "RECEIPT_MISMATCH"
		| "SHARED_WRITE_WORKSPACE"
		| "WRITE_CHILD_REQUIRES_SIBLING_WORKTREE";

	constructor(code: WorkspaceSafetyError["code"], message: string) {
		super(message);
		this.name = "WorkspaceSafetyError";
		this.code = code;
	}
}

function normalizeReportedPath(path: string): string {
	return process.platform === "win32" && /^\/[a-zA-Z](?:\/|$)/.test(path)
		? `${path[1]!.toUpperCase()}:${path.slice(2)}`
		: path;
}

function canonicalPath(path: string, relativeTo?: string): string {
	const normalized = normalizeReportedPath(path);
	return realpathSync(isAbsolute(normalized) ? normalized : resolve(relativeTo ?? process.cwd(), normalized));
}

function comparablePath(path: string): string {
	return process.platform === "win32" ? path.toLowerCase() : path;
}

function gitValue(workspace: string, args: readonly string[]): string | undefined {
	const result = spawnSync("git", ["-C", workspace, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0 || !result.stdout.trim()) return undefined;
	return result.stdout.trim();
}

function identity(parts: readonly string[]): string {
	return createHash("sha256").update(parts.join("\0")).digest("hex");
}

export function inspectWorkspaceOwnership(
	workspace: string,
	access: WorkspaceAccessMode,
	ownerInstanceId: string,
	now = new Date(),
): WorkspaceOwnershipReceipt {
	if (access !== "read-only" && access !== "write") throw new Error(`Unsupported workspace access: ${access}`);
	if (!ownerInstanceId || ownerInstanceId.length > 512) {
		throw new Error("ownerInstanceId must contain 1 to 512 characters");
	}
	const selectedPath = canonicalPath(workspace);
	const reportedRoot = gitValue(selectedPath, ["rev-parse", "--path-format=absolute", "--show-toplevel"]);
	const reportedCommon = gitValue(selectedPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
	const worktreeRoot = reportedRoot ? canonicalPath(reportedRoot, selectedPath) : selectedPath;
	const gitCommonDir = reportedCommon ? canonicalPath(reportedCommon, selectedPath) : undefined;
	const branchValue = gitCommonDir
		? gitValue(selectedPath, ["symbolic-ref", "--quiet", "--short", "HEAD"])
		: undefined;
	return {
		schemaVersion: 1,
		ownerInstanceId,
		access,
		selectedPath,
		worktreeRoot,
		gitCommonDir,
		worktreeIdentity: identity(gitCommonDir ? [gitCommonDir, worktreeRoot] : ["non-git", worktreeRoot]),
		branch: branchValue || undefined,
		selectedAt: now.toISOString(),
		managed: false,
	};
}

export function verifyWorkspaceOwnershipReceipt(receipt: Readonly<WorkspaceOwnershipReceipt>): boolean {
	try {
		const observed = inspectWorkspaceOwnership(receipt.selectedPath, receipt.access, receipt.ownerInstanceId);
		return (
			observed.schemaVersion === receipt.schemaVersion &&
			comparablePath(observed.selectedPath) === comparablePath(receipt.selectedPath) &&
			comparablePath(observed.worktreeRoot) === comparablePath(receipt.worktreeRoot) &&
			(observed.gitCommonDir === undefined) === (receipt.gitCommonDir === undefined) &&
			(observed.gitCommonDir === undefined ||
				comparablePath(observed.gitCommonDir) === comparablePath(receipt.gitCommonDir!)) &&
			observed.worktreeIdentity === receipt.worktreeIdentity &&
			observed.managed === false
		);
	} catch {
		return false;
	}
}

function isActive(record: InstanceRecord): boolean {
	return record.status === "starting" || record.status === "online" || record.status === "waiting-input";
}

export function assertWorkspaceAdmission(
	candidate: Readonly<WorkspaceOwnershipReceipt>,
	existingInstances: readonly Readonly<InstanceRecord>[],
	parentInstanceId?: string,
): void {
	const active = existingInstances.filter(isActive);
	const parent = parentInstanceId ? active.find((record) => record.id === parentInstanceId) : undefined;
	if (parentInstanceId && !parent) {
		throw new WorkspaceSafetyError("PARENT_NOT_FOUND", `Active parent instance not found: ${parentInstanceId}`);
	}
	if (candidate.access === "read-only") return;
	if (parent && !parent.workspaceReceipt) {
		throw new WorkspaceSafetyError(
			"AMBIGUOUS_EXISTING_OWNER",
			`Parent instance ${parent.id} lacks a workspace receipt`,
		);
	}
	if (parent?.workspaceReceipt?.access === "write") {
		const parentReceipt = parent.workspaceReceipt;
		if (
			!candidate.gitCommonDir ||
			!parentReceipt.gitCommonDir ||
			comparablePath(candidate.gitCommonDir) !== comparablePath(parentReceipt.gitCommonDir) ||
			candidate.worktreeIdentity === parentReceipt.worktreeIdentity
		) {
			throw new WorkspaceSafetyError(
				"WRITE_CHILD_REQUIRES_SIBLING_WORKTREE",
				"A concurrent write-capable child requires an explicitly selected sibling worktree from the parent's Git repository",
			);
		}
	}
	for (const record of active) {
		if (record.id === parentInstanceId) continue;
		const existing = record.workspaceReceipt;
		if (!existing) {
			throw new WorkspaceSafetyError(
				"AMBIGUOUS_EXISTING_OWNER",
				`Cannot admit a write-capable session while active instance ${record.id} lacks a workspace receipt`,
			);
		}
		if (existing.access !== "write") continue;
		if (existing.worktreeIdentity === candidate.worktreeIdentity) {
			throw new WorkspaceSafetyError(
				"SHARED_WRITE_WORKSPACE",
				`Write-capable instance ${record.id} already owns the selected worktree`,
			);
		}
	}
}
