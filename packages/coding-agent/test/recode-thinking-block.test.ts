import type { Component } from "@reitaard/recode-tui";
import { describe, expect, it } from "vitest";
import { RecodeThinkingBlock } from "../src/modes/interactive/components/recode-thinking-block.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";

describe("RecodeThinkingBlock", () => {
	it("uses the Tokyo Night pink accent rail without recoloring its content", () => {
		initTheme("dark");
		const content: Component = {
			render: (width) => [`reasoning:${width}`],
			invalidate: () => {},
		};
		const rendered = new RecodeThinkingBlock(content).render(20)[0] ?? "";

		expect(rendered).toContain(`${theme.getFgAnsi("accent")}▎`);
		expect(rendered).not.toContain(theme.getFgAnsi("borderAccent"));
		expect(rendered).toContain(" reasoning:18");
	});
});
