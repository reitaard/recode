import { describe, expect, it } from "vitest";
import { createRecodeShioriIndicator } from "../src/modes/interactive/components/recode-shiori-indicator.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

describe("Shiori indicator", () => {
	it("animates the star and shimmers across the complete Shiori line", () => {
		initTheme("dark", false);
		const indicator = createRecodeShioriIndicator(
			"Good evening. Your memory is safe within my pages. (134 entries)",
			theme,
		);
		const frames = indicator.frames ?? [];
		expect(frames.length).toBeGreaterThan(12);
		expect(indicator.intervalMs).toBe(80);
		expect(new Set(frames).size).toBeGreaterThan(4);
		for (const frame of frames) {
			const plain = frame.replace(ANSI_PATTERN, "");
			expect(plain).toMatch(
				/^[✦✧⋆] Shiori \(栞\): Good evening\. Your memory is safe within my pages\. \(134 entries\)$/,
			);
			expect(frame).toContain("\x1b[3m");
			expect(frame).toContain("\x1b[23m");
			expect(frame).not.toContain(theme.getFgAnsi("accent"));
		}
	});
});
