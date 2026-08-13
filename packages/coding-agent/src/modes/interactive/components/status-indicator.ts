import { type Component, Loader, type TUI, truncateToWidth, visibleWidth } from "@reitaard/recode-tui";
import type { WorkingIndicatorOptions } from "../../../core/extensions/index.ts";
import { theme } from "../theme/theme.ts";
import { CountdownTimer } from "./countdown-timer.ts";
import { keyText } from "./keybinding-hints.ts";
import { createRecodeMagicIndicator, recodeSpinner, selectRecodeSpinnerVerb } from "./recode-magic-indicator.ts";

export type StatusIndicatorKind = "working" | "retry" | "compaction" | "branchSummary";

export class StatusIndicator extends Loader {
	readonly kind: StatusIndicatorKind;

	constructor(
		kind: StatusIndicatorKind,
		ui: TUI,
		spinnerColorFn: (str: string) => string,
		messageColorFn: (str: string) => string,
		message: string,
		indicator?: WorkingIndicatorOptions,
	) {
		super(ui, spinnerColorFn, messageColorFn, message, indicator);
		this.kind = kind;
	}

	dispose(): void {
		this.stop();
	}

	override render(width: number): string[] {
		return super.render(width).slice(1);
	}
}

export class WorkingStatusIndicator extends StatusIndicator {
	private elapsedIntervalId: ReturnType<typeof setInterval> | undefined;
	private readonly startedAt: number;
	private readonly tui: TUI;
	private elapsedRuntime = formatElapsedRuntime(0);
	private usesCustomIndicator: boolean;
	private workingMessage: string;

	constructor(ui: TUI, message: string, indicator?: WorkingIndicatorOptions, startedAt = Date.now()) {
		super(
			"working",
			ui,
			recodeSpinner,
			(text) => text,
			indicator ? theme.fg("muted", message) : "",
			indicator ?? createRecodeMagicIndicator(selectRecodeSpinnerVerb()),
		);
		this.tui = ui;
		this.startedAt = startedAt;
		this.usesCustomIndicator = indicator !== undefined;
		this.workingMessage = message;
		if (!this.usesCustomIndicator) {
			this.startElapsedTimer();
		}
	}

	setGenerating(): void {
		// The default indicator already owns the seamless verb-to-encrypted sequence.
	}

	applyIndicator(indicator?: WorkingIndicatorOptions): void {
		this.usesCustomIndicator = indicator !== undefined;
		if (indicator) {
			this.stopElapsedTimer();
			super.setIndicator(indicator);
			super.setMessage(theme.fg("muted", this.workingMessage));
		} else {
			super.setIndicator(createRecodeMagicIndicator(selectRecodeSpinnerVerb()));
			this.startElapsedTimer();
		}
	}

	override setMessage(message: string): void {
		this.workingMessage = message;
		if (this.usesCustomIndicator) {
			super.setMessage(theme.fg("muted", message));
		}
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (this.usesCustomIndicator || lines.length === 0) return lines;

		const elapsed = recodeSpinner(this.elapsedRuntime);
		const elapsedWidth = visibleWidth(elapsed);
		const availableLeftWidth = Math.max(0, width - elapsedWidth - 1);
		const left = truncateToWidth(lines[lines.length - 1] ?? "", availableLeftWidth, "");
		const gap = Math.max(1, width - visibleWidth(left) - elapsedWidth);
		lines[lines.length - 1] = `${left}${" ".repeat(gap)}${elapsed}`;
		return lines;
	}

	override dispose(): void {
		this.stopElapsedTimer();
		super.dispose();
	}

	settle(outcome: SettledOutcome): SettledStatus {
		this.stopElapsedTimer();
		return new SettledStatus(outcome, this.elapsedRuntime);
	}

	private startElapsedTimer(): void {
		this.stopElapsedTimer();
		const updateElapsed = () => {
			this.elapsedRuntime = formatElapsedRuntime(Date.now() - this.startedAt);
			this.tui.requestRender();
		};
		updateElapsed();
		this.elapsedIntervalId = setInterval(updateElapsed, 1000);
	}

	private stopElapsedTimer(): void {
		if (this.elapsedIntervalId) {
			clearInterval(this.elapsedIntervalId);
			this.elapsedIntervalId = undefined;
		}
	}
}

export type SettledOutcome = "completed" | "failed" | "cancelled";

export class SettledStatus implements Component {
	private readonly outcome: SettledOutcome;
	private readonly elapsedRuntime: string;

	constructor(outcome: SettledOutcome, elapsedRuntime: string) {
		this.outcome = outcome;
		this.elapsedRuntime = elapsedRuntime;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const labels: Record<SettledOutcome, string> = {
			completed: "✓ Completed",
			failed: "✗ Failed",
			cancelled: "○ Cancelled",
		};
		const colors: Record<SettledOutcome, "success" | "error" | "warning"> = {
			completed: "success",
			failed: "error",
			cancelled: "warning",
		};
		const left = theme.fg(colors[this.outcome], labels[this.outcome]);
		const right = theme.fg(colors[this.outcome], this.elapsedRuntime);
		const availableLeftWidth = Math.max(0, width - visibleWidth(right) - 1);
		const clippedLeft = truncateToWidth(left, availableLeftWidth, "");
		const gap = Math.max(1, width - visibleWidth(clippedLeft) - visibleWidth(right));
		return [`${clippedLeft}${" ".repeat(gap)}${right}`];
	}
}

function formatElapsedRuntime(elapsedMs: number): string {
	const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) return `· ${hours}h ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
	if (minutes > 0) return `· ${minutes}m ${seconds.toString().padStart(2, "0")}s`;
	return `· ${seconds}s`;
}

const transientStatusColor = (text: string): string => theme.fg("accent", text);

export class RetryStatusIndicator extends StatusIndicator {
	private countdown: CountdownTimer | undefined;

	constructor(ui: TUI, attempt: number, maxAttempts: number, delayMs: number) {
		const retryMessage = (seconds: number) =>
			`Retrying (${attempt}/${maxAttempts}) in ${seconds}s... (${keyText("app.interrupt")} to cancel)`;
		super("retry", ui, transientStatusColor, transientStatusColor, retryMessage(Math.ceil(delayMs / 1000)));
		this.countdown = new CountdownTimer(
			delayMs,
			ui,
			(seconds) => {
				this.setMessage(retryMessage(seconds));
			},
			() => {
				this.countdown = undefined;
			},
		);
	}

	override dispose(): void {
		this.countdown?.dispose();
		this.countdown = undefined;
		super.dispose();
	}
}

export type CompactionStatusReason = "manual" | "threshold" | "overflow";

export class CompactionStatusIndicator extends StatusIndicator {
	constructor(ui: TUI, reason: CompactionStatusReason) {
		const cancelHint = `(${keyText("app.interrupt")} to cancel)`;
		const label =
			reason === "manual"
				? `Compacting context... ${cancelHint}`
				: `${reason === "overflow" ? "Context overflow detected, " : ""}Auto-compacting... ${cancelHint}`;
		super("compaction", ui, transientStatusColor, transientStatusColor, label);
	}
}

export class BranchSummaryStatusIndicator extends StatusIndicator {
	constructor(ui: TUI) {
		super(
			"branchSummary",
			ui,
			transientStatusColor,
			transientStatusColor,
			`Summarizing branch... (${keyText("app.interrupt")} to cancel)`,
		);
	}
}

export class IdleStatus implements Component {
	invalidate(): void {
		// No cached state to invalidate.
	}

	render(width: number): string[] {
		const emptyLine = " ".repeat(width);
		return [emptyLine, emptyLine];
	}
}
