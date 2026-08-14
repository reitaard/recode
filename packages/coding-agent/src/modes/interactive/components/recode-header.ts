import type { Component } from "@reitaard/recode-tui";
import { truncateToWidth, visibleWidth } from "@reitaard/recode-tui";
import chalk from "chalk";
import Yoga, { Direction, FlexDirection } from "yoga-layout";
import type { ActiveWorkerHeaderState } from "../../../core/delegation/worker-header-state.ts";
import { theme } from "../theme/theme.ts";
import { workerForeground } from "./recode-worker-indicator.ts";

export type RecodeHeaderMode = "hidden" | "welcome";

export interface RecodeHeaderDetails {
	model: string;
	provider: string;
	cwd: string;
	toolOutputKey: string;
	worker?: ActiveWorkerHeaderState;
}

type RecodeHeaderLayout = {
	mode: "compact" | "stacked" | "wide";
	leftWidth: number;
	rightWidth: number;
};

const WORDMARK_LETTERS = [
	["▄▀▀▀▀▀", "█     ", "▀▀▀▀▀▀"],
	["█▀▀▀▀█", "█    █", "▀▀▀▀▀▀"],
	["█▀▀▀▀▄", "█    █", "▀▀▀▀▀ "],
	["█▀▀▀▀▀", "█▀▀▀  ", "▀▀▀▀▀▀"],
] as const;
const MIN_STACKED_WIDTH = 48;
const MIN_WIDE_WIDTH = 72;
const WELCOME_BOX_HEIGHT = 9;
// The wordmark is a fixed brand asset; interface themes must not recolor it.
const BRAND_TEXT_PALETTE = ["#FF3478", "#FF8E71", "#EFFFBD"] as const;
const BRAND_LINE_PALETTE = ["#025D7A", "#00B6B9", "#55DC99", "#B2FF7B"] as const;

function padCell(text: string, width: number): string {
	const truncated = truncateToWidth(text, width, "");
	return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function centerCell(text: string, width: number): string {
	const truncated = truncateToWidth(text, width, "");
	const remaining = Math.max(0, width - visibleWidth(truncated));
	const left = Math.floor(remaining / 2);
	return " ".repeat(left) + truncated + " ".repeat(remaining - left);
}

function paletteColor(palette: readonly string[], index: number, text: string): string {
	return chalk.hex(palette[Math.min(index, palette.length - 1)]!)(text);
}

function textColor(index: number, text: string): string {
	return paletteColor(BRAND_TEXT_PALETTE, index, text);
}

function lineColor(index: number, text: string): string {
	return paletteColor(BRAND_LINE_PALETTE, index, text);
}

function gradientRule(text: string): string {
	const characters = [...text];
	return characters
		.map((character, index) =>
			lineColor(Math.floor((index * BRAND_LINE_PALETTE.length) / Math.max(1, characters.length)), character),
		)
		.join("");
}

function gradientText(text: string): string {
	const characters = [...text];
	return characters
		.map((character, index) =>
			textColor(Math.floor((index * BRAND_TEXT_PALETTE.length) / Math.max(1, characters.length)), character),
		)
		.join("");
}

function workerStatus(text: string): string {
	const normalized = text.trim().toLowerCase();
	if (["failed", "error", "unavailable", "timeout", "cancelled"].includes(normalized)) {
		return theme.bold(theme.fg("error", text));
	}
	if (["ready", "completed", "healthy"].includes(normalized)) {
		return theme.bold(theme.fg("success", text));
	}
	return theme.bold(theme.fg("warning", text));
}

function metric(value: number): string {
	return theme.bold(theme.fg("accent", String(value)));
}

function renderWordmarkRow(row: number): string {
	return WORDMARK_LETTERS.map((letter, index) => textColor(index % 3, letter[row]!)).join(" ");
}

function calculateLayout(width: number): RecodeHeaderLayout {
	if (width < MIN_STACKED_WIDTH) return { mode: "compact", leftWidth: width, rightWidth: 0 };

	const innerWidth = width - 2;
	const root = Yoga.Node.create();
	const brand = Yoga.Node.create();
	const divider = Yoga.Node.create();
	const details = Yoga.Node.create();

	try {
		root.setWidth(innerWidth);
		root.setFlexDirection(width >= MIN_WIDE_WIDTH ? FlexDirection.Row : FlexDirection.Column);
		brand.setFlexShrink(0);
		details.setFlexGrow(1);

		if (width >= MIN_WIDE_WIDTH) {
			brand.setWidth(32);
			brand.setMinWidth(28);
			divider.setWidth(1);
			details.setMinWidth(36);
		} else {
			brand.setWidth("100%");
			divider.setWidth("100%");
			details.setWidth("100%");
		}

		root.insertChild(brand, 0);
		root.insertChild(divider, 1);
		root.insertChild(details, 2);
		root.calculateLayout(innerWidth, "auto", Direction.LTR);

		return {
			mode: width >= MIN_WIDE_WIDTH ? "wide" : "stacked",
			leftWidth: Math.floor(brand.getComputedWidth()),
			rightWidth: Math.floor(details.getComputedWidth()),
		};
	} finally {
		root.freeRecursive();
	}
}

/** Responsive Recode welcome surface, ported from Claurst's layout rules. */
export class RecodeHeader implements Component {
	private readonly version: string;
	private readonly getMode: () => RecodeHeaderMode;
	private readonly getDetails: () => RecodeHeaderDetails;

	constructor(version: string, getMode: () => RecodeHeaderMode, getDetails?: () => RecodeHeaderDetails) {
		this.version = version;
		this.getMode = getMode;
		this.getDetails = getDetails ?? (() => ({ model: "unknown", provider: "unknown", cwd: ".", toolOutputKey: "" }));
	}

	invalidate(): void {
		// Layout is recalculated from the current terminal width on every render.
	}

	render(width: number): string[] {
		if (this.getMode() === "hidden" || width <= 0) return [];

		const layout = calculateLayout(width);
		if (layout.mode === "compact") return [this.renderCompact(width)];
		if (layout.mode === "stacked") return this.renderStacked(width, layout.leftWidth);
		return this.renderWide(width, layout.leftWidth, layout.rightWidth);
	}

	private renderCompact(width: number): string {
		return theme.bold(gradientText(truncateToWidth(`re™ CODE v${this.version} · / commands`, width, "")));
	}

	private renderTopBorder(width: number): string {
		const title = ` Recode v${this.version} `;
		const styledTitle = ` ${theme.bold(textColor(0, "Recode"))} ${textColor(2, `v${this.version}`)} `;
		return lineColor(0, "╭") + styledTitle + gradientRule(`${"─".repeat(width - visibleWidth(title) - 2)}╮`);
	}

	private renderBottomBorder(width: number): string {
		return gradientRule(`╰${"─".repeat(width - 2)}╯`);
	}

	private renderWide(width: number, leftWidth: number, rightWidth: number): string[] {
		const details = this.getDetails();
		const model = details.provider === "unknown" ? details.model : `${details.model} · ${details.provider}`;
		const workerLabel = (text: string): string =>
			details.worker ? workerForeground(details.worker.workerId, "text", text, theme) : text;
		const leftRows = [
			theme.bold(theme.fg("text", " Welcome to re™")),
			"",
			centerCell(renderWordmarkRow(0), leftWidth),
			centerCell(renderWordmarkRow(1), leftWidth),
			centerCell(renderWordmarkRow(2), leftWidth),
			theme.fg("muted", ` ${model}`),
			theme.fg("dim", ` ${details.cwd}`),
		];
		const rightRows = details.worker
			? [
					theme.bold(
						workerForeground(
							details.worker.workerId,
							"identity",
							` Direct chat · ${details.worker.workerName}`,
							theme,
						),
					),
					`${workerLabel(" Health       ")}${workerStatus(details.worker.status)}`,
					`${workerLabel(" Memory       ")}${metric(details.worker.memoryDocumentCount)}${theme.fg("dim", " documents")}`,
					`${workerLabel(" Progress     ")}${metric(details.worker.sessionCount)}${theme.fg("dim", " sessions · ")}${metric(details.worker.turnCount)}${theme.fg("dim", " turns")}`,
					`${workerLabel(" Evaluations  ")}${metric(details.worker.evaluationCount)}${theme.fg("dim", " recorded")}`,
					theme.fg("dim", " Enter sends · Esc returns to Aizen"),
					"",
				]
			: [
					theme.bold(theme.fg("accent", " Tips for getting started")),
					theme.fg("muted", " Type / for commands · ! for bash"),
					theme.fg("dim", ` Press ${details.toolOutputKey} to expand startup help`),
					"",
					theme.bold(theme.fg("borderAccent", " Session")),
					theme.fg("muted", " Fresh session · ready"),
					theme.fg("dim", " Type a message to begin"),
				];
		const rows = [this.renderTopBorder(width)];

		for (let row = 0; row < WELCOME_BOX_HEIGHT - 2; row++) {
			rows.push(
				lineColor(0, "│") +
					padCell(leftRows[row]!, leftWidth) +
					lineColor(1, "│") +
					padCell(rightRows[row]!, rightWidth) +
					lineColor(3, "│"),
			);
		}

		rows.push(this.renderBottomBorder(width));
		return rows;
	}

	private renderStacked(width: number, contentWidth: number): string[] {
		const details = this.getDetails();
		const model = details.provider === "unknown" ? details.model : `${details.model} · ${details.provider}`;
		const rows = [
			this.renderTopBorder(width),
			lineColor(0, "│") + centerCell(renderWordmarkRow(0), contentWidth) + lineColor(3, "│"),
			lineColor(0, "│") + centerCell(renderWordmarkRow(1), contentWidth) + lineColor(3, "│"),
			lineColor(0, "│") + centerCell(renderWordmarkRow(2), contentWidth) + lineColor(3, "│"),
			lineColor(0, "│") + padCell(theme.fg("muted", ` ${model}`), contentWidth) + lineColor(3, "│"),
			lineColor(0, "│") + padCell(theme.fg("dim", ` ${details.cwd}`), contentWidth) + lineColor(3, "│"),
			lineColor(0, "│") +
				padCell(theme.fg("accent", ` / commands · ! bash · ${details.toolOutputKey} help`), contentWidth) +
				lineColor(3, "│"),
			lineColor(0, "│") + " ".repeat(contentWidth) + lineColor(3, "│"),
			this.renderBottomBorder(width),
		];
		return rows;
	}
}
