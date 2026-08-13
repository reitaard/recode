import { describe, expect, test, vi } from "vitest";
import { formatLspCall, renderLspResult, renderMutationLspDiagnostics } from "../src/lsp/render.ts";
import { CachedOutputBlock } from "../src/modes/interactive/components/cached-output-block.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

initTheme("dark");

function expectLspMarker(
	rendered: string[],
	color: "toolPendingStatus" | "toolRunningStatus" | "toolSuccessStatus" | "toolErrorStatus",
): void {
	expect(rendered.every((line) => stripAnsi(line).startsWith("▎"))).toBe(true);
	expect(rendered.join("\n")).toContain(theme.fg(color, "▎"));
}

describe("LSP renderer", () => {
	test("groups references into a collapsed tree card", () => {
		const component = renderLspResult(
			{
				content: [{ type: "text", text: "3 references found" }],
				details: {
					action: "references",
					servers: ["typescript-language-server"],
					request: { action: "references", file: "src/sample.ts", line: 4, symbol: "value" },
					locations: [
						{ file: "src/sample.ts", line: 4, character: 7, context: "const value = 1;" },
						{ file: "src/consumer.ts", line: 8, character: 3 },
						{ file: "src/consumer.ts", line: 12, character: 5 },
					],
				},
			},
			{ expanded: false, isPartial: false },
			theme,
			{
				args: { action: "references", file: "src/sample.ts", line: 4, symbol: "value" },
				isError: false,
			} as never,
		);
		const rendered = component.render(80);
		const output = rendered.map(stripAnsi).join("\n");
		expect(rendered.join("\n")).toContain(theme.fg("mdLink", "LSP"));
		expect(output).toContain("✓ LSP references");
		expect(output).toContain("✓ 3 references in 2 files");
		expect(output).toContain("symbol: value");
		expect(output).toContain("├─ src/sample.ts 1 result");
		expect(output).toContain("const value = 1;");
		expect(output).toContain("└─ src/consumer.ts 2 results");
		expect(output).toContain("… 1 more");
		expectLspMarker(rendered, "toolSuccessStatus");
	});

	test("renders partial arguments immediately and animates while running", () => {
		vi.useFakeTimers();
		const state: { spinnerInterval?: ReturnType<typeof setInterval> } = {};
		let invalidations = 0;
		const baseContext = {
			state,
			isPartial: true,
			executionStarted: false,
			invalidate: () => invalidations++,
		};
		const pending = formatLspCall({} as never, theme, baseContext as never);
		expect(stripAnsi(pending)).toBe("⠋ LSP: Analyzing...");
		expect(pending).toContain(theme.fg("warning", "⠋"));
		expect(pending).toContain(theme.fg("mdLink", theme.bold("LSP")));
		expect(state.spinnerInterval).toBeDefined();
		vi.advanceTimersByTime(80);
		expect(invalidations).toBe(1);

		const running = formatLspCall({ action: "references", file: "src/sample.ts", line: 4, symbol: "value" }, theme, {
			...baseContext,
			executionStarted: true,
		} as never);
		expect(stripAnsi(running)).toContain("LSP references src/sample.ts:4 value");
		expect(running).toContain(theme.fg("accent", "⠙"));
		vi.advanceTimersByTime(160);
		expect(invalidations).toBe(3);

		formatLspCall({ action: "references" } as never, theme, { ...baseContext, isPartial: false } as never);
		expect(state.spinnerInterval).toBeUndefined();
		vi.useRealTimers();
	});

	test("renders pending and running full LSP results with matching markers", () => {
		const result = {
			content: [{ type: "text", text: "checking" }],
			details: { action: "diagnostics" as const, servers: [] },
		};
		const pending = renderLspResult(result, { expanded: false, isPartial: true }, theme, {
			args: { action: "diagnostics" },
			isPartial: true,
			executionStarted: false,
			isError: false,
		} as never).render(80);
		expectLspMarker(pending, "toolPendingStatus");

		const running = renderLspResult(result, { expanded: false, isPartial: true }, theme, {
			args: { action: "diagnostics" },
			isPartial: true,
			executionStarted: true,
			isError: false,
		} as never).render(80);
		expectLspMarker(running, "toolRunningStatus");
	});

	test("renders a failed full LSP result with an error marker", () => {
		const rendered = renderLspResult(
			{
				content: [{ type: "text", text: "request failed" }],
				details: { action: "diagnostics", servers: [] },
			},
			{ expanded: false, isPartial: false },
			theme,
			{ args: { action: "diagnostics" }, isError: true } as never,
		).render(80);

		expectLspMarker(rendered, "toolErrorStatus");
	});

	test("shows the exact character offset used by a completed request", () => {
		const component = renderLspResult(
			{
				content: [{ type: "text", text: "1 reference found" }],
				details: {
					action: "references",
					servers: ["typescript-language-server"],
					request: { action: "references", file: "src/sample.ts", line: 4, character: 23 },
					locations: [{ file: "src/sample.ts", line: 4, character: 24 }],
				},
			},
			{ expanded: false, isPartial: false },
			theme,
			{ args: { action: "references" }, isError: false } as never,
		);
		const output = component.render(80).map(stripAnsi).join("\n");
		expect(output).toContain("character 23 (0-based)");
	});

	test("renders post-mutation warnings with the violet and pink diagnostic card palette", () => {
		const rendered = renderMutationLspDiagnostics(
			{
				summary: "LSP: 2 warnings",
				messages: ["sample.ts", "  2 warnings", "    1:1 [biome] unused import"],
				errored: false,
				servers: ["biome"],
			},
			theme,
		).render(80);
		const output = rendered.map(stripAnsi).join("\n");
		expect(output).toContain("! LSP");
		expect(output).not.toContain("LSP diagnostics");
		expect(output).toContain("Response");
		expect(rendered.join("\n")).toContain(theme.fg("borderMuted", theme.bold("LSP")));
		expect(rendered.join("\n")).toContain(theme.fg("accent", "Response"));
		expectLspMarker(rendered, "toolRunningStatus");
		expect(rendered.join("\n")).toContain(`${theme.fg("accent", "LSP:")}${theme.fg("warning", " 2 warnings")}`);
	});

	test("renders post-mutation errors in the error color", () => {
		const rendered = renderMutationLspDiagnostics(
			{
				summary: "LSP: 1 error",
				messages: ["sample.ts", "  1 error"],
				errored: true,
				servers: ["typescript-language-server"],
			},
			theme,
		).render(80);
		expect(rendered.join("\n")).toContain(`${theme.fg("accent", "LSP:")}${theme.fg("error", " 1 error")}`);
		expectLspMarker(rendered, "toolErrorStatus");
	});

	test("renders a successful post-mutation status with a pink prefix and default text", () => {
		const rendered = renderMutationLspDiagnostics(
			{
				summary: "LSP: no issues",
				messages: [],
				errored: false,
				servers: ["biome"],
			},
			theme,
		).render(80);
		expect(rendered.join("\n")).toContain(`${theme.fg("accent", "LSP:")}${theme.fg("toolOutput", " no issues")}`);
		expectLspMarker(rendered, "toolSuccessStatus");
	});

	test("renders a pending post-mutation status in yellow", () => {
		const rendered = renderMutationLspDiagnostics(
			{
				summary: "LSP: checking in background",
				messages: [],
				errored: false,
				servers: ["typescript-language-server"],
				checking: true,
			},
			theme,
		).render(80);
		expect(rendered.join("\n")).toContain(
			`${theme.fg("accent", "LSP:")}${theme.fg("warning", " checking in background")}`,
		);
		expectLspMarker(rendered, "toolRunningStatus");
	});

	test("caches identical card layouts and invalidates explicitly", () => {
		const block = new CachedOutputBlock();
		const options = { header: "LSP", sections: [{ lines: ["result"] }], width: 40 };
		const first = block.render(options, theme);
		expect(block.render(options, theme)).toBe(first);
		block.invalidate();
		expect(block.render(options, theme)).not.toBe(first);
	});
});
