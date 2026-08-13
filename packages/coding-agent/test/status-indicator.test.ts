import type { TUI } from "@reitaard/recode-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recodeSpinner } from "../src/modes/interactive/components/recode-magic-indicator.ts";
import {
	BranchSummaryStatusIndicator,
	CompactionStatusIndicator,
	IdleStatus,
	RetryStatusIndicator,
	WorkingStatusIndicator,
} from "../src/modes/interactive/components/status-indicator.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

describe("status indicators", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("keeps idle status at the same height as status indicators", () => {
		const idleStatus = new IdleStatus();

		const lines = idleStatus.render(20);
		expect(lines).toHaveLength(2);
		expect(lines).toEqual([" ".repeat(20), " ".repeat(20)]);
	});

	it("disposes retry countdown updates", () => {
		initTheme("dark");
		vi.useFakeTimers();
		const requestRender = vi.fn();
		const tui = { requestRender } as unknown as TUI;
		const indicator = new RetryStatusIndicator(tui, 1, 3, 1000);
		const callsBeforeDispose = requestRender.mock.calls.length;

		indicator.dispose();
		vi.advanceTimersByTime(2000);

		expect(requestRender).toHaveBeenCalledTimes(callsBeforeDispose);
	});

	it("uses Tokyo Night pink only for cancellable transient states", () => {
		initTheme("dark");
		vi.useFakeTimers();
		const tui = { requestRender: vi.fn() } as unknown as TUI;
		const indicators = [
			new RetryStatusIndicator(tui, 1, 3, 1000),
			new CompactionStatusIndicator(tui, "manual"),
			new BranchSummaryStatusIndicator(tui),
		];
		const accentAnsi = theme.getFgAnsi("accent");
		const limeFrame = recodeSpinner("frame");
		const limeAnsi = limeFrame.slice(0, limeFrame.indexOf("frame"));

		for (const indicator of indicators) {
			const rendered = indicator.render(100).join("\n");
			expect(rendered.split(accentAnsi).length - 1).toBeGreaterThanOrEqual(2);
			expect(rendered).not.toContain(limeAnsi);
			indicator.dispose();
		}

		const working = new WorkingStatusIndicator(tui, "Working...");
		const workingRendered = working.render(100).join("\n");
		expect(workingRendered).toContain(limeAnsi);
		expect(workingRendered).not.toContain(accentAnsi);
		working.dispose();
	});

	it("starts and keeps the encrypted animation running", () => {
		initTheme("dark");
		vi.useFakeTimers();
		const requestRender = vi.fn();
		const tui = { requestRender } as unknown as TUI;
		const indicator = new WorkingStatusIndicator(tui, "Working...");
		indicator.setGenerating();
		vi.advanceTimersByTime(3200);
		const callsAfterTwoLoops = requestRender.mock.calls.length;
		vi.advanceTimersByTime(1100);

		expect(requestRender.mock.calls.length).toBeGreaterThan(callsAfterTwoLoops);
		indicator.dispose();
		const callsBeforeDispose = requestRender.mock.calls.length;
		vi.advanceTimersByTime(1100);
		expect(requestRender).toHaveBeenCalledTimes(callsBeforeDispose);
	});

	it("right-aligns the live run time opposite the default encrypted animation", () => {
		initTheme("dark");
		vi.useFakeTimers();
		const tui = { requestRender: vi.fn() } as unknown as TUI;
		const indicator = new WorkingStatusIndicator(tui, "Working...");

		const initialLines = indicator.render(80).map(stripAnsi);
		expect(initialLines).toHaveLength(1);
		expect(initialLines.at(-1)?.endsWith("· 0s")).toBe(true);
		vi.advanceTimersByTime(61_000);
		const elapsedLines = indicator.render(80).map(stripAnsi);
		expect(elapsedLines).toHaveLength(1);
		expect(elapsedLines.at(-1)?.endsWith("· 1m 01s")).toBe(true);

		indicator.dispose();
	});
});
