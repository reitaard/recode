import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyUpstreamTrees, createUpstreamPlan, type TreeEntry } from "../src/recode/update/upstream-plan.ts";

function entry(object: string): TreeEntry {
	return { mode: "100644", type: "blob", object };
}

function git(root: string, ...args: string[]): string {
	return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

describe("Recode custom-first upstream planning", () => {
	it("classifies custom, upstream, identical, protected, overlapping, and renamed paths", () => {
		const base = new Map([
			["custom.ts", entry("base-custom")],
			["same.ts", entry("base-same")],
			["shared.ts", entry("base-shared")],
			["upstream.ts", entry("base-upstream")],
			["packages/coding-agent/src/repi/owned.ts", entry("base-owned")],
			["renamed.ts", entry("base-renamed")],
		]);
		const ours = new Map(base);
		ours.set("custom.ts", entry("ours-custom"));
		ours.set("same.ts", entry("same-result"));
		ours.set("shared.ts", entry("ours-shared"));
		const target = new Map(base);
		target.set("same.ts", entry("same-result"));
		target.set("shared.ts", entry("upstream-shared"));
		target.set("upstream.ts", entry("new-upstream"));
		target.delete("packages/coding-agent/src/repi/owned.ts");
		target.delete("renamed.ts");
		target.set("renamed-new.ts", entry("base-renamed"));

		const changes = classifyUpstreamTrees(
			base,
			ours,
			target,
			["packages/coding-agent/src/repi/**"],
			new Set(["renamed.ts", "renamed-new.ts"]),
		);
		expect(Object.fromEntries(changes.map((change) => [change.path, change.classification]))).toEqual({
			"custom.ts": "custom-only",
			"packages/coding-agent/src/repi/owned.ts": "protected-upstream-change",
			"renamed-new.ts": "rename-review",
			"renamed.ts": "rename-review",
			"same.ts": "identical-change",
			"shared.ts": "overlap",
			"upstream.ts": "upstream-only",
		});
	});

	it("plans from an exact baseline without changing the worktree", () => {
		const root = mkdtempSync(join(tmpdir(), "repi-upstream-plan-"));
		git(root, "init");
		git(root, "config", "user.email", "repi-test@example.invalid");
		git(root, "config", "user.name", "Recode Test");
		writeFileSync(join(root, "shared.txt"), "base\n");
		writeFileSync(join(root, "custom.txt"), "base\n");
		git(root, "add", "shared.txt", "custom.txt");
		git(root, "commit", "-m", "base");
		const base = git(root, "rev-parse", "HEAD");

		git(root, "switch", "-c", "upstream-target");
		writeFileSync(join(root, "shared.txt"), "upstream\n");
		git(root, "add", "shared.txt");
		git(root, "commit", "-m", "upstream");
		const target = git(root, "rev-parse", "HEAD");
		git(root, "tag", "-a", "upstream-test-target", "-m", "upstream test target");

		git(root, "switch", "-c", "recode", base);
		writeFileSync(join(root, "custom.txt"), "recode\n");
		mkdirSync(join(root, "repi"));
		mkdirSync(join(root, "recode"));
		writeFileSync(join(root, "recode", "product.json"), '{"productName":"Recode","appName":"recode"}\n');
		writeFileSync(
			join(root, "recode", "upstream-ownership.json"),
			`${JSON.stringify({
				schemaVersion: 1,
				upstreamBase: base,
				defaultTarget: "upstream-test-target",
				protectedPaths: ["repi/**"],
			})}\n`,
		);
		git(root, "add", "custom.txt", "repi", "recode");
		git(root, "commit", "-m", "recode");
		const before = git(root, "status", "--porcelain=v1");

		const plan = createUpstreamPlan(root);

		expect(plan.baseCommit).toBe(base);
		expect(plan.targetCommit).toBe(target);
		expect(plan.counts["custom-only"]).toBe(3);
		expect(plan.counts["upstream-only"]).toBe(1);
		expect(plan.counts.overlap).toBe(0);
		expect(git(root, "status", "--porcelain=v1")).toBe(before);

		writeFileSync(join(root, "custom.txt"), "dirty\n");
		expect(() => createUpstreamPlan(root)).toThrow("uncommitted files");
	});
});
