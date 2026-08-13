import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkerGitReadTool } from "../src/core/workers/levi/git-read-tool.ts";

const tempDirectories: string[] = [];

function git(root: string, ...args: string[]): string {
	return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("delegated read-only Git tool", () => {
	it("returns bounded repository evidence without modifying the worktree", async () => {
		const root = mkdtempSync(join(tmpdir(), "recode-worker-git-"));
		tempDirectories.push(root);
		git(root, "init");
		git(root, "config", "user.email", "recode-worker@example.invalid");
		git(root, "config", "user.name", "Recode Worker");
		writeFileSync(join(root, "tracked.txt"), "evidence\n");
		git(root, "add", "tracked.txt");
		git(root, "commit", "-m", "evidence commit");
		const before = git(root, "status", "--porcelain=v1");
		const tool = createWorkerGitReadTool(root);

		const response = await tool.execute("git-read", { args: ["log", "-1", "--oneline"] });
		const text = response.content.find((item) => item.type === "text")?.text ?? "";

		expect(text).toContain("evidence commit");
		expect(response.details.exitCode).toBe(0);
		expect(git(root, "status", "--porcelain=v1")).toBe(before);
	});

	it("refuses mutation commands, workspace escapes, and execution flags", async () => {
		const root = mkdtempSync(join(tmpdir(), "recode-worker-git-"));
		tempDirectories.push(root);
		git(root, "init");
		const tool = createWorkerGitReadTool(root);

		await expect(tool.execute("git-write", { args: ["reset", "--hard"] })).rejects.toThrow(
			"Unsupported read-only Git subcommand",
		);
		await expect(tool.execute("git-escape", { args: ["show", "../outside"] })).rejects.toThrow("may not traverse");
		await expect(tool.execute("git-exec", { args: ["log", "--exec=calc.exe"] })).rejects.toThrow(
			"Blocked Git argument",
		);
	});
});
