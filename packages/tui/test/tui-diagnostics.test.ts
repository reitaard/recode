import assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writeTuiDiagnostic } from "../src/diagnostics.ts";
import { ProcessTerminal } from "../src/terminal.ts";
import type { Component } from "../src/tui.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

class TestComponent implements Component {
	invalidate(): void {}

	render(): string[] {
		return ["diagnostic test"];
	}
}

describe("TUI diagnostics", () => {
	it("creates parent directories and redacts bounded fields", () => {
		const root = mkdtempSync(join(tmpdir(), "recode-tui-diagnostics-"));
		try {
			const logPath = join(root, "nested", "diagnostics.jsonl");
			writeTuiDiagnostic(logPath, "crash", {
				message: "token=secret-value",
				stack: "x".repeat(10_000),
			});

			const record = JSON.parse(readFileSync(logPath, "utf8").trim()) as {
				message: string;
				stack: string;
			};
			assert.strictEqual(record.message, "token=[REDACTED]");
			assert.strictEqual(record.stack.length, 4_000);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("captures all ProcessTerminal output helpers", () => {
		const root = mkdtempSync(join(tmpdir(), "recode-tui-raw-"));
		const originalWrite = process.stdout.write;
		process.stdout.write = (() => true) as typeof process.stdout.write;
		try {
			const terminal = new ProcessTerminal({ writeLogPath: join(root, "nested", "capture.log") });
			terminal.write("frame");
			terminal.hideCursor();
			terminal.clearScreen();
			const capture = readFileSync(join(root, "nested", "capture.log"), "utf8");
			assert.match(capture, /frame/);
			assert.match(capture, /\x1b\[\?25l/);
			assert.match(capture, /\x1b\[2J\x1b\[H/);
		} finally {
			process.stdout.write = originalWrite;
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("records slow render metadata without rendered content", async () => {
		const root = mkdtempSync(join(tmpdir(), "recode-tui-render-"));
		const terminal = new VirtualTerminal(40, 10);
		const tui = new TuiMainScreen(terminal, undefined, {
			logPath: join(root, "diagnostics.jsonl"),
			slowRenderThresholdMs: 0,
		});
		tui.addChild(new TestComponent());

		try {
			tui.start();
			await terminal.waitForRender();
		} finally {
			tui.stop();
		}

		try {
			const records = readFileSync(join(root, "diagnostics.jsonl"), "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as { kind: string; lineCount?: number; message?: string });
			const slowRender = records.find((record) => record.kind === "slow-render");
			assert.ok(slowRender, "expected a slow-render diagnostic");
			assert.strictEqual(slowRender.lineCount, 1);
			assert.strictEqual(slowRender.message, undefined);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
