import type { Component } from "@reitaard/recode-tui";
import { theme } from "../theme/theme.ts";

/** Adds a re.pi accent rail to visible model reasoning. */
export class RecodeThinkingBlock implements Component {
	private readonly content: Component;

	constructor(content: Component) {
		this.content = content;
	}

	invalidate(): void {
		this.content.invalidate?.();
	}

	render(width: number): string[] {
		if (width <= 2) return this.content.render(width);

		const rail = theme.fg("accent", "▎");
		return this.content.render(width - 2).map((line) => `${rail} ${line}`);
	}
}
