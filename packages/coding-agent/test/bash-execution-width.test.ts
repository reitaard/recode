/**
 * Test that BashExecutionComponent's collapsed output respects the render-time width,
 * not a stale captured width. Regression test for #2569.
 */
import { visibleWidth } from "@reitaard/recode-tui";
import { beforeAll, describe, expect, it } from "vitest";
import { BashExecutionComponent } from "../src/modes/interactive/components/bash-execution.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { SgrStreamSanitizer, stripAnsi } from "../src/utils/ansi.ts";

/** Minimal TUI stub that only exposes terminal.columns */
function createTuiStub(columns: number): { columns: number; stub: any } {
	const state = { columns };
	const stub = {
		terminal: {
			get columns() {
				return state.columns;
			},
			get rows() {
				return 24;
			},
		},
		// Loader calls ui.addInterval / ui.removeInterval
		addInterval: (_cb: () => void, _ms: number) => ({ dispose: () => {} }),
		removeInterval: () => {},
		requestRender: () => {},
	};
	return { columns: state.columns, stub };
}

describe("BashExecutionComponent width handling (#2569)", () => {
	beforeAll(() => {
		initTheme(undefined, false);
	});

	it("collapsed preview lines respect render-time width, not construction-time width", () => {
		const wideWidth = 200;
		const narrowWidth = 80;

		const { stub } = createTuiStub(wideWidth);
		const component = new BashExecutionComponent("pwd", stub);

		// Add output with long lines that will wrap differently at different widths
		const longLine = "x".repeat(150);
		component.appendOutput(`${longLine}\n${longLine}\n`);

		// Complete the command so it enters collapsed mode
		component.setComplete(0, false);

		// Render at the narrow width (simulating a resize or split pane)
		const lines = component.render(narrowWidth);

		// Every rendered line must fit within the narrow width
		for (let i = 0; i < lines.length; i++) {
			const w = visibleWidth(lines[i]);
			expect(w, `Line ${i} visibleWidth=${w} > ${narrowWidth}`).toBeLessThanOrEqual(narrowWidth);
		}
	});

	it("re-computes lines when width changes between renders", () => {
		const { stub } = createTuiStub(200);
		const component = new BashExecutionComponent("echo hello", stub);

		const longLine = "abcdefghij".repeat(20); // 200 chars
		component.appendOutput(`${longLine}\n`);
		component.setComplete(0, false);

		// First render at width 200
		const lines200 = component.render(200);
		for (const line of lines200) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(200);
		}

		// Second render at width 60 (split pane scenario)
		const lines60 = component.render(60);
		for (let i = 0; i < lines60.length; i++) {
			const w = visibleWidth(lines60[i]);
			expect(w, `Line ${i} visibleWidth=${w} > 60`).toBeLessThanOrEqual(60);
		}
	});

	it("preserves streamed SGR colors while stripping unsafe terminal controls", () => {
		const { stub } = createTuiStub(120);
		const component = new BashExecutionComponent("color output", stub);
		component.appendOutput("\u001b[3");
		component.appendOutput("1mred\u001b[0m \u001b[2");
		component.appendOutput("Jclear\n");
		component.setComplete(0, false);

		const rendered = component.render(120).join("\n");
		expect(rendered).toContain("\u001b[31mred\u001b[0m");
		expect(rendered).not.toContain("\u001b[2J");
		expect(stripAnsi(rendered)).toContain("red clear");
	});

	it("does not leak an incomplete streamed escape sequence", () => {
		const sanitizer = new SgrStreamSanitizer();
		expect(sanitizer.push("safe\u001b[")).toBe("safe");
		expect(sanitizer.finish()).toBe("");
	});

	it("reveals collapsed direct-shell output when tool expansion is enabled", () => {
		const { stub } = createTuiStub(120);
		const component = new BashExecutionComponent("!! list files", stub, true);
		component.appendOutput(Array.from({ length: 30 }, (_, index) => `line-${index + 1}`).join("\n"));
		component.setComplete(0, false);

		expect(component.render(120).join("\n")).not.toContain("line-1\n");
		component.setExpanded(true);
		expect(component.render(120).join("\n")).toContain("line-1");
	});
});
