import { describe, expect, it } from "vitest";
import { formatRecodeThinkingLevel } from "../src/modes/interactive/components/recode-thinking-label.ts";

describe("re.code thinking labels", () => {
	it("labels a binary medium compatibility value as on", () => {
		expect(formatRecodeThinkingLevel("off", ["off", "medium"])).toBe("off");
		expect(formatRecodeThinkingLevel("medium", ["off", "medium"])).toBe("on");
	});

	it("preserves graded reasoning labels", () => {
		const levels = ["off", "minimal", "low", "medium", "high"] as const;
		expect(formatRecodeThinkingLevel("minimal", levels)).toBe("minimal");
		expect(formatRecodeThinkingLevel("medium", levels)).toBe("medium");
		expect(formatRecodeThinkingLevel("high", levels)).toBe("high");
	});
});
