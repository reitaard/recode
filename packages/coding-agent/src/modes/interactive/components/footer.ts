import { isAbsolute, relative, resolve, sep } from "node:path";
import { type Component, truncateToWidth, visibleWidth } from "@reitaard/recode-tui";
import type { AgentSession } from "../../../core/agent-session.ts";
import { areExperimentalFeaturesEnabled } from "../../../core/experimental.ts";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.ts";
import { stripAnsi } from "../../../utils/ansi.ts";
import { theme } from "../theme/theme.ts";
import { formatRecodeThinkingLevel } from "./recode-thinking-label.ts";

const SMART_CONTEXT_COMPACT_THRESHOLD_PERCENT = 40;
const FOOTER_STATUS_PRIORITIES = new Map([
	["recode-memory", 0],
	["mcp", 1],
]);

/**
 * Sanitize text for display in a single-line status.
 * Removes newlines, tabs, carriage returns, and other control characters.
 */
function sanitizeStatusText(text: string): string {
	// Replace newlines, tabs, carriage returns with space, then collapse multiple spaces
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function formatFooterStatus(key: string, text: string): string {
	const sanitized = sanitizeStatusText(text);
	if (key !== "mcp") return sanitized;

	const visible = stripAnsi(sanitized);
	if (!visible) return sanitized;

	let formatted = visible;
	const compactMatch = visible.match(/^MCP\s+(\d+)\s*\/\s*(\d+)$/i);
	if (compactMatch) {
		formatted = `MCP: ${compactMatch[1]}/${compactMatch[2]}`;
	} else {
		const fullMatch = visible.match(
			/^(?:🔌\s*)?MCP:\s*(\d+)\s+servers?\s+enabled(?:\s+\((\d+)\s+connected\))?(?:\s+\(\d+\s+disabled\))?$/i,
		);
		if (fullMatch) {
			formatted = `MCP: ${fullMatch[2] ?? "0"}/${fullMatch[1]}`;
		} else {
			formatted = visible.replace(/^(?:🔌\s*)?MCP:\s*/, "MCP: ");
		}
	}

	// MCP extensions may provide ANSI colors, but the core footer owns this status color.
	return theme.fg("warning", formatted);
}

/**
 * Format token counts for compact footer display.
 */
export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

export function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

/**
 * Footer component that shows pwd, token stats, and context usage.
 * Computes token/context stats from session, gets git branch and extension statuses from provider.
 */
export class FooterComponent implements Component {
	private session: AgentSession;
	private footerData: ReadonlyFooterDataProvider;
	private clockRefreshTimer: ReturnType<typeof setInterval> | undefined;

	constructor(session: AgentSession, footerData: ReadonlyFooterDataProvider, requestRender?: () => void) {
		this.session = session;
		this.footerData = footerData;
		if (requestRender) {
			this.clockRefreshTimer = setInterval(requestRender, 1000);
		}
	}

	setSession(session: AgentSession): void {
		this.session = session;
	}

	setAutoCompactEnabled(enabled: boolean): void {
		void enabled;
	}

	/**
	 * No-op: git branch caching now handled by provider.
	 * Kept for compatibility with existing call sites in interactive-mode.
	 */
	invalidate(): void {
		// No-op: git branch is cached/invalidated by provider
	}

	/**
	 * Clean up resources.
	 * Git watcher cleanup now handled by provider.
	 */
	dispose(): void {
		if (this.clockRefreshTimer) {
			clearInterval(this.clockRefreshTimer);
			this.clockRefreshTimer = undefined;
		}
	}

	render(width: number): string[] {
		const state = this.session.state;

		// Calculate cumulative usage from ALL session entries (not just post-compaction messages)
		let totalInput = 0;
		let totalOutput = 0;
		let totalCacheRead = 0;
		let totalCacheWrite = 0;
		let totalCost = 0;
		let latestCacheHitRate: number | undefined;

		for (const entry of this.session.sessionManager.getEntries()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				totalInput += entry.message.usage.input;
				totalOutput += entry.message.usage.output;
				totalCacheRead += entry.message.usage.cacheRead;
				totalCacheWrite += entry.message.usage.cacheWrite;
				totalCost += entry.message.usage.cost.total;

				const latestPromptTokens =
					entry.message.usage.input + entry.message.usage.cacheRead + entry.message.usage.cacheWrite;
				latestCacheHitRate =
					latestPromptTokens > 0 ? (entry.message.usage.cacheRead / latestPromptTokens) * 100 : undefined;
			}
		}

		// Calculate context usage from session (handles compaction correctly).
		// After compaction, tokens are unknown until the next LLM response.
		const contextUsage = this.session.getContextUsage();
		const contextPercentValue = contextUsage?.percent ?? 0;
		const contextPercent = contextUsage?.percent == null ? "?" : contextPercentValue.toFixed(1);
		const contextTokens = contextUsage?.tokens == null ? undefined : formatTokens(contextUsage.tokens);

		// Replace home directory with ~
		let pwd = formatCwdForFooter(this.session.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);

		// Add git branch if available
		const branch = this.footerData.getGitBranch();
		if (branch) {
			pwd = `${pwd} (${branch})`;
		}

		// Add session name if set
		const sessionName = this.session.sessionManager.getSessionName();
		if (sessionName) {
			pwd = `${pwd} • ${sessionName}`;
		}

		// Build stats line
		const statsParts = [];
		if (totalInput) statsParts.push(theme.fg("accent", `↑${formatTokens(totalInput)}`));
		if (totalOutput) statsParts.push(theme.fg("accent", `↓${formatTokens(totalOutput)}`));
		if (totalCacheRead) statsParts.push(theme.fg("accent", `R${formatTokens(totalCacheRead)}`));
		if (totalCacheWrite) statsParts.push(theme.fg("accent", `W${formatTokens(totalCacheWrite)}`));
		if ((totalCacheRead > 0 || totalCacheWrite > 0) && latestCacheHitRate !== undefined) {
			statsParts.push(theme.fg("accent", `CH${latestCacheHitRate.toFixed(1)}%`));
		}
		// Show cost with "(sub)" indicator if using OAuth subscription
		const usingSubscription = state.model ? this.session.modelRegistry.isUsingOAuth(state.model) : false;
		if (totalCost || usingSubscription) {
			const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
			statsParts.push(theme.fg("toolSuccessStatus", costStr));
		}

		// Suggest compaction before a small local model reaches its less reliable long-context range.
		const compactHint =
			contextPercentValue >= SMART_CONTEXT_COMPACT_THRESHOLD_PERCENT && this.session.isCompactionAvailable()
				? " (compact?)"
				: "";
		const contextText =
			contextPercent === "?"
				? "ctx ?"
				: `ctx ${contextTokens ? `${contextTokens} ` : ""}${contextPercent}%${compactHint}`;
		statsParts.push(contextPercent === "?" ? theme.fg("footer", contextText) : theme.fg("accent", contextText));
		if (areExperimentalFeaturesEnabled()) {
			statsParts.push(`${theme.fg("dim", "•")} ${theme.bold(theme.fg("warning", "xp"))}`);
		}

		let statsLeft = statsParts.join(" ");

		// Add model name on the right side, plus thinking level if model supports it
		const modelName = state.model?.id || "no-model";

		let statsLeftWidth = visibleWidth(statsLeft);

		// If statsLeft is too wide, truncate it
		if (statsLeftWidth > width) {
			statsLeft = truncateToWidth(statsLeft, width, "...");
			statsLeftWidth = visibleWidth(statsLeft);
		}

		// Calculate available space for padding (minimum 2 spaces between stats and model)
		const minPadding = 2;

		// Add thinking level indicator if model supports reasoning
		let rightSideWithoutProvider = modelName;
		if (state.model?.reasoning) {
			const thinkingLevel = state.thinkingLevel || "off";
			const thinkingLabel = formatRecodeThinkingLevel(thinkingLevel, this.session.getAvailableThinkingLevels());
			rightSideWithoutProvider = `${modelName} • thinking ${thinkingLabel}`;
		}

		// Prepend the provider in parentheses if there are multiple providers and there's enough room
		let rightSide = rightSideWithoutProvider;
		if (this.footerData.getAvailableProviderCount() > 1 && state.model) {
			rightSide = `(${state.model!.provider}) ${rightSideWithoutProvider}`;
			if (statsLeftWidth + minPadding + visibleWidth(rightSide) > width) {
				// Too wide, fall back
				rightSide = rightSideWithoutProvider;
			}
		}

		const rightSideWidth = visibleWidth(rightSide);
		const totalNeeded = statsLeftWidth + minPadding + rightSideWidth;

		let statsLine: string;
		if (totalNeeded <= width) {
			// Both fit - add padding to right-align model
			const padding = " ".repeat(width - statsLeftWidth - rightSideWidth);
			statsLine = statsLeft + padding + rightSide;
		} else {
			// Need to truncate right side
			const availableForRight = width - statsLeftWidth - minPadding;
			if (availableForRight > 0) {
				const truncatedRight = truncateToWidth(rightSide, availableForRight, "");
				const truncatedRightWidth = visibleWidth(truncatedRight);
				const padding = " ".repeat(Math.max(0, width - statsLeftWidth - truncatedRightWidth));
				statsLine = statsLeft + padding + truncatedRight;
			} else {
				// Not enough space for right side at all
				statsLine = statsLeft;
			}
		}

		// Apply dim to each part separately. statsLeft may contain color codes (for context %)
		// that end with a reset, which would clear an outer dim wrapper. So we dim the parts
		// before and after the colored section independently.
		const dimStatsLeft = theme.fg("footer", statsLeft);
		const remainder = statsLine.slice(statsLeft.length); // padding + rightSide
		const dimRemainder = theme.fg("footer", remainder);

		const pwdLine = truncateToWidth(theme.fg("footer", pwd), width, theme.fg("footer", "..."));
		const lines = [pwdLine, dimStatsLeft + dimRemainder];

		// Add core statuses before extension-controlled statuses; extension cleanup cannot erase core state.
		const coreStatuses = Array.from(this.footerData.getCoreStatuses?.().entries() ?? []);
		const extensionStatuses = Array.from(this.footerData.getExtensionStatuses().entries());
		const sortedStatuses = [
			...coreStatuses,
			...extensionStatuses.sort(([a], [b]) => {
				const priorityA = FOOTER_STATUS_PRIORITIES.get(a) ?? Number.MAX_SAFE_INTEGER;
				const priorityB = FOOTER_STATUS_PRIORITIES.get(b) ?? Number.MAX_SAFE_INTEGER;
				return priorityA - priorityB || a.localeCompare(b);
			}),
		].map(([key, text]) => {
			const formatted = formatFooterStatus(key, text);
			if (key === "maestro" && formatted.startsWith("MAESTRO")) {
				return theme.fg("borderMuted", formatted.replace(" ◆ ", ": "));
			}
			return formatted;
		});
		const statusLine = sortedStatuses.join("  ");
		let clock = theme.fg(
			"muted",
			new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }),
		);
		if (visibleWidth(clock) > width) {
			clock = truncateToWidth(clock, width, "");
		}
		const clockWidth = visibleWidth(clock);
		const availableStatusWidth = Math.max(0, width - clockWidth - (statusLine ? 1 : 0));
		const leftStatus = truncateToWidth(statusLine, availableStatusWidth, theme.fg("footer", "..."));
		const gap = Math.max(0, width - visibleWidth(leftStatus) - clockWidth);
		lines.push(`${leftStatus}${" ".repeat(gap)}${clock}`);

		return lines;
	}
}
