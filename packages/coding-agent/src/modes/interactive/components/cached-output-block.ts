/** Reusable cached output card adapted from can1357/oh-my-pi (MIT). */

import { visibleWidth, wrapTextWithAnsi } from "@reitaard/recode-tui";
import type { Theme, ThemeColor } from "../theme/theme.ts";

export interface CachedOutputBlockOptions {
	header: string;
	sections: Array<{ label?: string; lines: readonly string[] }>;
	width: number;
	borderColor?: ThemeColor;
}

function fitLine(text: string, width: number): string {
	return `${text}${" ".repeat(Math.max(0, width - visibleWidth(text)))}`;
}

function renderBar(
	left: string,
	right: string,
	label: string | undefined,
	width: number,
	border: (text: string) => string,
): string {
	const prefix = `${left}───`;
	const available = Math.max(0, width - visibleWidth(prefix) - visibleWidth(right));
	const rawLabel = label ? ` ${label} ` : "";
	const visibleLabel = visibleWidth(rawLabel) <= available ? rawLabel : "";
	return `${border(prefix)}${visibleLabel}${border("─".repeat(Math.max(0, available - visibleWidth(visibleLabel))))}${border(right)}`;
}

export class CachedOutputBlock {
	private cacheKey?: string;
	private cacheLines?: string[];

	render(options: CachedOutputBlockOptions, theme: Theme): string[] {
		const key = JSON.stringify(options);
		if (key === this.cacheKey && this.cacheLines) return this.cacheLines;

		const width = Math.max(12, options.width);
		const innerWidth = Math.max(1, width - 3);
		const border = (text: string) => theme.fg(options.borderColor ?? "borderMuted", text);
		const lines: string[] = [renderBar("╭", "╮", options.header, width, border)];
		for (const section of options.sections) {
			if (section.label) lines.push(renderBar("├", "┤", section.label, width, border));
			for (const sourceLine of section.lines) {
				const wrapped = wrapTextWithAnsi(sourceLine, innerWidth);
				for (const line of wrapped.length > 0 ? wrapped : [""]) {
					lines.push(`${border("│")} ${fitLine(line, innerWidth)}${border("│")}`);
				}
			}
		}
		lines.push(`${border("╰───")}${border("─".repeat(Math.max(0, width - 5)))}${border("╯")}`);
		this.cacheKey = key;
		this.cacheLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cacheKey = undefined;
		this.cacheLines = undefined;
	}
}
