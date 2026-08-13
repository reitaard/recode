import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { applyTerminalSetup, createTerminalSetupPlan } from "../src/core/terminal-setup.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Recode terminal setup", () => {
	test("previews and applies Windows Terminal bindings with a backup", () => {
		const directory = mkdtempSync(join(tmpdir(), "recode-terminal-setup-"));
		tempDirs.push(directory);
		const configPath = join(directory, "settings.json");
		const before = '{\n  "profiles": {}\n}\n';
		writeFileSync(configPath, before, "utf8");

		const plan = createTerminalSetupPlan("windows-terminal", { configPath });
		expect(plan.supported).toBe(true);
		if (!plan.supported) return;
		expect(plan.diff).toContain('"keys": "shift+enter"');
		expect(plan.diff).toContain("\\u001b[1;3A");
		expect(plan.diff).toContain('"keys": "ctrl+z"');

		const result = applyTerminalSetup(plan);
		expect(result.backupPath).not.toBe("");
		expect(existsSync(result.backupPath)).toBe(true);
		expect(readFileSync(result.backupPath, "utf8")).toBe(before);
		expect(readFileSync(configPath, "utf8")).toContain("sendInput");
		expect(readFileSync(configPath, "utf8")).toContain("\\u001b[13;2u");
	});

	test("previews VS Code terminalFocus bindings without modifying the file", () => {
		const directory = mkdtempSync(join(tmpdir(), "recode-terminal-setup-"));
		tempDirs.push(directory);
		const configPath = join(directory, "keybindings.json");
		const before = "[]\n";
		writeFileSync(configPath, before, "utf8");

		const plan = createTerminalSetupPlan("vscode", { configPath });
		expect(plan.supported).toBe(true);
		if (!plan.supported) return;
		expect(plan.diff).toContain("terminalFocus");
		expect(plan.diff).toContain("workbench.action.terminal.sendSequence");
		expect(readFileSync(configPath, "utf8")).toBe(before);
	});

	test("ignores brackets inside JSONC comments while locating arrays and objects", () => {
		const directory = mkdtempSync(join(tmpdir(), "recode-terminal-setup-"));
		tempDirs.push(directory);
		const configPath = join(directory, "settings.json");
		const before = '{\n  // comment with ] and }\n  "profiles": {}\n}\n';
		writeFileSync(configPath, before, "utf8");

		const plan = createTerminalSetupPlan("windows-terminal", { configPath });
		expect(plan.supported).toBe(true);
		if (!plan.supported) return;
		expect(plan.after).toContain('"keys": "shift+enter"');
	});
});
