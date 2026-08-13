import type { Component } from "@reitaard/recode-tui";
import type { ToolRenderContext, ToolRenderResultOptions } from "../core/extensions/types.ts";
import { getTextOutput, shortenPath } from "../core/tools/render-utils.ts";
import { CachedOutputBlock } from "../modes/interactive/components/cached-output-block.ts";
import { keyHint } from "../modes/interactive/components/keybinding-hints.ts";
import type { Theme } from "../modes/interactive/theme/theme.ts";
import type { LspToolDetails, LspToolInput } from "./tool.ts";
import type { LspFileDiagnosticsResult } from "./writethrough.ts";

const LSP_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const LSP_SPINNER_INTERVAL_MS = 80;

interface LspCallRenderState {
	spinnerFrame?: number;
	spinnerInterval?: ReturnType<typeof setInterval>;
}

export function formatLspCall(args: LspToolInput, theme: Theme, context: ToolRenderContext): string {
	const state = context.state as LspCallRenderState;
	if (!context.isPartial) {
		if (state.spinnerInterval) clearInterval(state.spinnerInterval);
		state.spinnerInterval = undefined;
		return "";
	}
	const partialArgs = args && typeof args === "object" ? (args as Partial<LspToolInput>) : {};
	const action = typeof partialArgs.action === "string" ? partialArgs.action.replaceAll("_", " ") : "";
	let target = partialArgs.file ? shortenPath(partialArgs.file) : partialArgs.query ? `"${partialArgs.query}"` : "";
	if (partialArgs.line !== undefined) target += `:${partialArgs.line}`;
	if (partialArgs.symbol) target += ` ${partialArgs.symbol}`;
	else if (partialArgs.character !== undefined) target += `:${partialArgs.character}`;
	if (!state.spinnerInterval) {
		state.spinnerFrame ??= 0;
		state.spinnerInterval = setInterval(() => {
			state.spinnerFrame = ((state.spinnerFrame ?? 0) + 1) % LSP_SPINNER_FRAMES.length;
			context.invalidate();
		}, LSP_SPINNER_INTERVAL_MS);
	}
	const indicator = theme.fg(
		context.executionStarted ? "accent" : "warning",
		LSP_SPINNER_FRAMES[state.spinnerFrame ?? 0] ?? "⠋",
	);
	const actionText = action ? ` ${theme.fg("accent", action)}` : `${theme.fg("muted", ": Analyzing...")}`;
	return `${indicator} ${theme.fg("mdLink", theme.bold("LSP"))}${actionText}${target ? ` ${theme.fg("toolOutput", target)}` : ""}`;
}

function formatLspResultLines(
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: LspToolDetails;
	},
	options: ToolRenderResultOptions,
	theme: Theme,
	isError: boolean,
): string {
	const output = getTextOutput(result, false).trim();
	if (isError) return `${theme.fg("toolErrorStatus", "×")} ${theme.fg("error", output || "LSP request failed")}`;

	const locations = result.details?.locations;
	if (!locations) return output ? theme.fg("toolOutput", output) : "";

	const action = result.details?.action.replaceAll("_", " ") ?? "result";
	const byFile = new Map<string, typeof locations>();
	for (const location of locations) {
		const group = byFile.get(location.file) ?? [];
		group.push(location);
		byFile.set(location.file, group);
	}
	if (locations.length === 0) {
		return `${theme.fg("toolSuccessStatus", "✓")} ${theme.fg("toolOutput", `0 ${action} found`)}`;
	}

	const groups = [...byFile.entries()];
	const visibleGroups = options.expanded ? groups : groups.slice(0, 3);
	const resultLabel = action === "references" ? action : `${action}${locations.length === 1 ? "" : "s"}`;
	let text = `${theme.fg("toolSuccessStatus", "✓")} ${theme.fg("toolOutput", `${locations.length} ${resultLabel} in ${groups.length} file${groups.length === 1 ? "" : "s"}`)}`;
	for (let groupIndex = 0; groupIndex < visibleGroups.length; groupIndex++) {
		const [file, fileLocations] = visibleGroups[groupIndex];
		const isLastVisibleFile = groupIndex === visibleGroups.length - 1 && groups.length === visibleGroups.length;
		const fileBranch = isLastVisibleFile ? "   └─" : "   ├─";
		const childPrefix = isLastVisibleFile ? "      " : "   │  ";
		text += `\n${theme.fg("dim", fileBranch)} ${theme.fg("accent", shortenPath(file))} ${theme.fg("muted", `${fileLocations.length} result${fileLocations.length === 1 ? "" : "s"}`)}`;
		const visibleLocations = options.expanded ? fileLocations : fileLocations.slice(0, 1);
		for (let locationIndex = 0; locationIndex < visibleLocations.length; locationIndex++) {
			const location = visibleLocations[locationIndex];
			const isLastLocation =
				locationIndex === visibleLocations.length - 1 && fileLocations.length === visibleLocations.length;
			text += `\n${theme.fg("dim", `${childPrefix}${isLastLocation ? "└─" : "├─"} line ${location.line}, col ${location.character}`)}`;
			if (location.context) text += `\n${theme.fg("muted", `${childPrefix}   ${location.context}`)}`;
		}
		if (!options.expanded && fileLocations.length > visibleLocations.length) {
			text += `\n${theme.fg("muted", `${childPrefix}└─ … ${fileLocations.length - visibleLocations.length} more`)}`;
		}
	}
	const hiddenFiles = groups.length - visibleGroups.length;
	if (hiddenFiles > 0) text += `\n${theme.fg("muted", `   └─ … ${hiddenFiles} more files`)}`;
	if (!options.expanded && (hiddenFiles > 0 || groups.some(([, items]) => items.length > 1))) {
		text += ` ${keyHint("app.tools.expand", "to expand")}`;
	}
	return text;
}

export function renderMutationLspDiagnostics(diagnostics: LspFileDiagnosticsResult, theme: Theme): Component {
	const block = new CachedOutputBlock();
	const warning = !diagnostics.errored && !diagnostics.checking && /\bwarnings?\b/.test(diagnostics.summary);
	const stateIcon = diagnostics.errored
		? theme.fg("toolErrorStatus", "×")
		: diagnostics.checking
			? theme.fg("warning", "…")
			: warning
				? theme.fg("warning", "!")
				: theme.fg("toolSuccessStatus", "✓");
	const summaryColor = diagnostics.errored ? "error" : diagnostics.checking || warning ? "warning" : "toolOutput";
	const summary = diagnostics.summary.startsWith("LSP:")
		? `${theme.fg("accent", "LSP:")}${theme.fg(summaryColor, diagnostics.summary.slice(4))}`
		: theme.fg(summaryColor, diagnostics.summary);
	const messageColor = diagnostics.errored ? "error" : "toolOutput";
	const body = [summary, ...diagnostics.messages.map((line) => theme.fg(messageColor, line))];
	const statusColor = diagnostics.errored
		? "toolErrorStatus"
		: diagnostics.checking || warning
			? "toolRunningStatus"
			: "toolSuccessStatus";
	const marker = theme.fg(statusColor, "▎");
	return {
		render(width: number): string[] {
			return block
				.render(
					{
						header: `${stateIcon} ${theme.fg("borderMuted", theme.bold("LSP"))}`,
						sections: [{ label: theme.fg("accent", "Response"), lines: body }],
						width: Math.max(12, width - 1),
						borderColor: diagnostics.errored ? "toolErrorStatus" : "borderMuted",
					},
					theme,
				)
				.map((line) => marker + line);
		},
		invalidate(): void {
			block.invalidate();
		},
	};
}

export function renderLspResult(
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: LspToolDetails;
	},
	options: ToolRenderResultOptions,
	theme: Theme,
	context: ToolRenderContext,
): Component {
	const block = new CachedOutputBlock();
	const action =
		context.args && typeof context.args === "object" && "action" in context.args
			? String(context.args.action).replaceAll("_", " ")
			: (result.details?.action.replaceAll("_", " ") ?? "result");
	const request = result.details?.request ?? (context.args as LspToolInput);
	const requestLines: string[] = [];
	if (request.file) requestLines.push(theme.fg("accent", shortenPath(request.file)));
	if (request.line !== undefined) requestLines.push(theme.fg("dim", `line ${request.line}`));
	if (request.character !== undefined) requestLines.push(theme.fg("dim", `character ${request.character} (0-based)`));
	if (request.symbol) requestLines.push(theme.fg("dim", `symbol: ${request.symbol}`));
	if (request.query) requestLines.push(theme.fg("dim", `query: ${request.query}`));
	const stateIcon = context.isError ? theme.fg("toolErrorStatus", "×") : theme.fg("toolSuccessStatus", "✓");
	const body = formatLspResultLines(result, options, theme, context.isError).split("\n");
	const statusColor = context.isPartial
		? context.executionStarted
			? "toolRunningStatus"
			: "toolPendingStatus"
		: context.isError
			? "toolErrorStatus"
			: "toolSuccessStatus";
	const marker = theme.fg(statusColor, "▎");
	return {
		render(width: number): string[] {
			return block
				.render(
					{
						header: `${stateIcon} ${theme.fg("mdLink", "LSP")} ${theme.fg("accent", action)}`,
						sections: [
							...(requestLines.length > 0 ? [{ lines: requestLines }] : []),
							{ label: theme.fg("toolTitle", "Response"), lines: body },
						],
						width: Math.max(12, width - 1),
						borderColor: context.isError ? "toolErrorStatus" : "borderMuted",
					},
					theme,
				)
				.map((line) => marker + line);
		},
		invalidate(): void {
			block.invalidate();
		},
	};
}
