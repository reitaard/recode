import type { AgentSessionEvent, RpcExtensionUIRequest, RpcResponse } from "@reitaard/recode-coding-agent";
import {
	type Component,
	type Focusable,
	Input,
	Key,
	type KeyId,
	matchesKey,
	ProcessTerminal,
	TuiMainScreen,
	truncateToWidth,
	visibleWidth,
} from "@reitaard/recode-tui";
import chalk from "chalk";
import {
	IpcMaestroDashboardClient,
	type MaestroDashboardAttachment,
	type MaestroDashboardClient,
	type MaestroDashboardSnapshot,
} from "./dashboard-client.ts";
import type { InstanceSummary } from "./ipc/protocol.ts";

const REFRESH_INTERVAL_MS = 1_000;
const STOP_CONFIRM_WINDOW_MS = 3_000;
const MAX_DISPLAY_OUTPUT_CHARS = 2_048;

function safeText(value: string | undefined, fallback = "—"): string {
	if (!value) return fallback;
	const sanitized = value
		.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, "")
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return sanitized || fallback;
}

function formatElapsed(startedAt: string, now = Date.now()): string {
	const parsedStartedAt = Date.parse(startedAt);
	if (!Number.isFinite(parsedStartedAt)) return "—";
	const elapsedSeconds = Math.max(0, Math.floor((now - parsedStartedAt) / 1_000));
	if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
	const minutes = Math.floor(elapsedSeconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h${minutes % 60}m`;
}

function statusColor(state: InstanceSummary["lifecycleState"], text: string): string {
	if (state === "RUNNING" || state === "SUCCEEDED") return chalk.green(text);
	if (state === "WAITING_INPUT") return chalk.yellow(text);
	if (state === "FAILED" || state === "UNKNOWN") return chalk.red(text);
	if (state === "PENDING" || state === "STARTING" || state === "CANCEL_REQUESTED") return chalk.cyan(text);
	return chalk.gray(text);
}

function appendEventOutput(current: string, event: AgentSessionEvent): string {
	if (event.type !== "message_update" || event.assistantMessageEvent.type !== "text_delta") return current;
	return safeText(`${current}${event.assistantMessageEvent.delta}`, "").slice(-MAX_DISPLAY_OUTPUT_CHARS);
}

export interface MaestroDashboardKeybindings {
	search: KeyId;
	clearSearch: KeyId;
}

export const DEFAULT_MAESTRO_DASHBOARD_KEYBINDINGS: MaestroDashboardKeybindings = {
	search: "/",
	clearSearch: "ctrl+x",
};

export interface MaestroDashboardOptions {
	client?: MaestroDashboardClient;
	requestRender(): void;
	onQuit(): void;
	now?: () => number;
	initialQuery?: string;
	initialSelector?: string;
	keybindings?: Partial<MaestroDashboardKeybindings>;
}

export function searchMaestroInstances(instances: readonly InstanceSummary[], query: string): InstanceSummary[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return [...instances];
	return instances.filter((instance) =>
		[instance.id, instance.label, instance.cwd, instance.workspace?.branch, instance.workspace?.worktreeRoot]
			.filter((value): value is string => typeof value === "string")
			.some((value) => value.toLowerCase().includes(normalized)),
	);
}

export function resolveMaestroInstance(instances: readonly InstanceSummary[], selector: string): InstanceSummary {
	const normalized = selector.trim().toLowerCase();
	if (!normalized) throw new Error("A session id or label is required");
	const exact = instances.filter(
		(instance) => instance.id.toLowerCase() === normalized || instance.label?.toLowerCase() === normalized,
	);
	const matches = exact.length > 0 ? exact : searchMaestroInstances(instances, normalized);
	if (matches.length === 0) throw new Error(`No Maestro session matches ${JSON.stringify(selector)}`);
	if (matches.length > 1) {
		throw new Error(`Maestro session selector ${JSON.stringify(selector)} is ambiguous (${matches.length} matches)`);
	}
	return matches[0];
}

export class MaestroDashboard implements Component, Focusable {
	private readonly client: MaestroDashboardClient;
	private readonly requestRender: () => void;
	private readonly onQuit: () => void;
	private readonly now: () => number;
	private snapshot: MaestroDashboardSnapshot | undefined;
	private selectedIndex = 0;
	private attachment: MaestroDashboardAttachment | undefined;
	private attachedInstanceId: string | undefined;
	private attachedOutput = "";
	private pendingUiRequest: RpcExtensionUIRequest | undefined;
	private pendingSelection = 0;
	private input: Input | undefined;
	private inputPurpose: "prompt" | "search" | "ui" | undefined;
	private busy = false;
	private statusMessage = "Connecting to Maestro";
	private stopConfirmation: { instanceId: string; expiresAt: number } | undefined;
	private query: string;
	private initialSelector: string | undefined;
	private readonly keybindings: MaestroDashboardKeybindings;
	private _focused = false;

	constructor(options: MaestroDashboardOptions) {
		this.client = options.client ?? new IpcMaestroDashboardClient();
		this.requestRender = options.requestRender;
		this.onQuit = options.onQuit;
		this.now = options.now ?? Date.now;
		this.query = options.initialQuery?.trim() ?? "";
		this.initialSelector = options.initialSelector;
		this.keybindings = { ...DEFAULT_MAESTRO_DASHBOARD_KEYBINDINGS, ...options.keybindings };
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		if (this.input) this.input.focused = value;
	}

	async refresh(): Promise<void> {
		try {
			this.snapshot = await this.client.refresh();
			const instances = this.visibleInstances();
			this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, instances.length - 1));
			if (this.initialSelector) {
				const selected = resolveMaestroInstance(this.snapshot.instances, this.initialSelector);
				this.initialSelector = undefined;
				const selectedIndex = instances.findIndex((instance) => instance.id === selected.id);
				if (selectedIndex === -1) throw new Error("Selected Maestro session is excluded by the current search");
				this.selectedIndex = selectedIndex;
				await this.attachSelected();
			} else if (!this.busy) this.statusMessage = "Live";
		} catch (error) {
			this.statusMessage = error instanceof Error ? error.message : String(error);
		}
		this.requestRender();
	}

	private visibleInstances(): InstanceSummary[] {
		return searchMaestroInstances(this.snapshot?.instances ?? [], this.query);
	}

	private selectedInstance(): InstanceSummary | undefined {
		return this.visibleInstances()[this.selectedIndex];
	}

	private runAction(action: () => Promise<void>): void {
		if (this.busy) return;
		this.busy = true;
		void action()
			.catch((error: unknown) => {
				this.statusMessage = error instanceof Error ? error.message : String(error);
			})
			.finally(() => {
				this.busy = false;
				this.requestRender();
			});
	}

	private detach(): void {
		this.attachment?.close();
		this.attachment = undefined;
		this.attachedInstanceId = undefined;
		this.pendingUiRequest = undefined;
		this.input = undefined;
		this.inputPurpose = undefined;
		this.statusMessage = "Detached; session remains live";
	}

	private async attachSelected(): Promise<void> {
		const instance = this.selectedInstance();
		if (!instance) return;
		if (this.attachedInstanceId === instance.id) {
			this.statusMessage = "Already attached";
			return;
		}
		this.detach();
		const eventsBeforeAttachment: AgentSessionEvent[] = [];
		let attachmentClosedError: Error | undefined;
		const attachment = await this.client.attach(
			instance.id,
			(event) => {
				if (!this.attachment) eventsBeforeAttachment.push(event);
				else this.attachedOutput = appendEventOutput(this.attachedOutput, event);
				this.requestRender();
			},
			(request) => {
				if (
					request.method !== "select" &&
					request.method !== "confirm" &&
					request.method !== "input" &&
					request.method !== "editor"
				) {
					return;
				}
				this.pendingUiRequest = request;
				this.pendingSelection = 0;
				if (request.method === "input") this.beginInput("ui");
				if (request.method === "editor") this.beginInput("ui", request.prefill ?? "");
				this.requestRender();
			},
			(response: RpcResponse) => {
				this.statusMessage = response.success
					? `${response.command} accepted`
					: safeText(response.error, "RPC failed");
				this.requestRender();
			},
			(error) => {
				if (!this.attachment) attachmentClosedError = error ?? new Error("Attachment closed");
				this.attachment = undefined;
				this.attachedInstanceId = undefined;
				this.statusMessage = error?.message ?? "Attachment closed";
				this.requestRender();
			},
		);
		if (attachmentClosedError) {
			attachment.close();
			throw attachmentClosedError;
		}
		this.attachment = attachment;
		this.attachedInstanceId = instance.id;
		this.attachedOutput = instance.latestOutput ?? "";
		for (const event of attachment.replay.events) this.attachedOutput = appendEventOutput(this.attachedOutput, event);
		for (const event of eventsBeforeAttachment) this.attachedOutput = appendEventOutput(this.attachedOutput, event);
		if (attachment.replay.pendingUiRequest) {
			this.pendingUiRequest = attachment.replay.pendingUiRequest;
			if (this.pendingUiRequest.method === "input" || this.pendingUiRequest.method === "editor") {
				this.beginInput(
					"ui",
					this.pendingUiRequest.method === "editor" ? (this.pendingUiRequest.prefill ?? "") : "",
				);
			}
		}
		this.statusMessage = `Attached to ${safeText(instance.label, instance.id.slice(0, 8))}`;
	}

	private beginInput(purpose: "prompt" | "search" | "ui", initialValue = ""): void {
		const input = new Input();
		input.focused = this.focused;
		input.setValue(initialValue);
		input.onEscape = () => {
			this.input = undefined;
			this.inputPurpose = undefined;
			this.requestRender();
		};
		input.onSubmit = (value) => {
			const text = value.trim();
			if (!text) return;
			if (purpose === "prompt") {
				this.attachment?.send({ type: "prompt", message: text });
			} else if (purpose === "search") {
				this.query = text;
				this.selectedIndex = 0;
				this.statusMessage = `Filtered to ${this.visibleInstances().length} session(s)`;
			} else if (this.pendingUiRequest) {
				this.attachment?.send({ type: "extension_ui_response", id: this.pendingUiRequest.id, value: text });
				this.pendingUiRequest = undefined;
			}
			this.input = undefined;
			this.inputPurpose = undefined;
			this.requestRender();
		};
		this.input = input;
		this.inputPurpose = purpose;
	}

	private respondToPending(confirmed: boolean): void {
		const request = this.pendingUiRequest;
		if (!request || request.method !== "confirm") return;
		this.attachment?.send({ type: "extension_ui_response", id: request.id, confirmed });
		this.pendingUiRequest = undefined;
		this.statusMessage = confirmed ? "Confirmed" : "Declined";
	}

	handleInput(data: string): void {
		if (this.input) {
			this.input.handleInput(data);
			return;
		}
		const pending = this.pendingUiRequest;
		if (pending?.method === "confirm") {
			if (data.toLowerCase() === "y") this.respondToPending(true);
			else if (data.toLowerCase() === "n" || matchesKey(data, Key.escape)) this.respondToPending(false);
			return;
		}
		if (pending?.method === "select") {
			if (matchesKey(data, Key.up)) this.pendingSelection = Math.max(0, this.pendingSelection - 1);
			else if (matchesKey(data, Key.down)) {
				this.pendingSelection = Math.min(pending.options.length - 1, this.pendingSelection + 1);
			} else if (matchesKey(data, Key.enter)) {
				const value = pending.options[this.pendingSelection];
				if (value) this.attachment?.send({ type: "extension_ui_response", id: pending.id, value });
				this.pendingUiRequest = undefined;
			} else if (matchesKey(data, Key.escape)) {
				this.attachment?.send({ type: "extension_ui_response", id: pending.id, cancelled: true });
				this.pendingUiRequest = undefined;
			}
			return;
		}
		if (matchesKey(data, Key.up)) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.selectedIndex = Math.max(0, Math.min(this.visibleInstances().length - 1, this.selectedIndex + 1));
			return;
		}
		const key = data.toLowerCase();
		if (matchesKey(data, this.keybindings.search)) {
			this.beginInput("search", this.query);
		} else if (matchesKey(data, this.keybindings.clearSearch)) {
			this.query = "";
			this.selectedIndex = 0;
			this.statusMessage = "Search cleared";
		} else if (key === "q" || matchesKey(data, Key.escape)) {
			this.detach();
			this.onQuit();
		} else if (key === "r") {
			this.runAction(async () => await this.refresh());
		} else if (key === "a" || matchesKey(data, Key.enter)) {
			this.runAction(async () => await this.attachSelected());
		} else if (key === "d") {
			this.detach();
		} else if (key === "p" && this.attachment) {
			this.beginInput("prompt");
		} else if (key === "c") {
			const selected = this.selectedInstance();
			if (selected) {
				this.runAction(async () => {
					await this.client.cancel(selected.id);
					this.statusMessage = "Cancellation requested";
				});
			}
		} else if (key === "s") {
			const selected = this.selectedInstance();
			if (!selected) return;
			if (this.stopConfirmation?.instanceId === selected.id && this.stopConfirmation.expiresAt >= this.now()) {
				this.stopConfirmation = undefined;
				this.runAction(async () => {
					if (this.attachedInstanceId === selected.id) this.detach();
					await this.client.stop(selected.id);
					this.statusMessage = "Session stopped";
					await this.refresh();
				});
			} else {
				this.stopConfirmation = { instanceId: selected.id, expiresAt: this.now() + STOP_CONFIRM_WINDOW_MS };
				this.statusMessage = "Press S again within 3 seconds to stop this session";
			}
		}
	}

	private renderHeader(width: number): string[] {
		const health = this.snapshot?.health;
		const state = health?.state ?? "offline";
		const stateText = health?.ready
			? health.state === "degraded"
				? chalk.yellow(`◆ ${state}`)
				: chalk.green(`◆ ${state}`)
			: chalk.red(`◆ ${state}`);
		const title = `${chalk.bold(chalk.cyan("RECODE"))} ${chalk.gray("/")} ${chalk.bold("MAESTRO")}`;
		const right = `${stateText}  ${health?.liveInstances ?? 0} live  ${health?.waitingInput ?? 0} waiting`;
		const gap = " ".repeat(Math.max(2, width - visibleWidth(title) - visibleWidth(right)));
		return [truncateToWidth(`${title}${gap}${right}`, width), chalk.gray("─".repeat(width))];
	}

	render(width: number): string[] {
		const lines = this.renderHeader(width);
		const instances = this.visibleInstances();
		if (instances.length === 0) {
			lines.push(
				"",
				chalk.gray(
					this.query
						? `  No Maestro sessions match ${JSON.stringify(this.query)}.`
						: "  No Maestro sessions. Use `recode maestro spawn --read-only` to start one.",
				),
			);
		} else {
			for (let index = 0; index < instances.length; index++) {
				const instance = instances[index];
				const selected = index === this.selectedIndex;
				const marker = selected ? chalk.cyan("▌") : " ";
				const attached = instance.id === this.attachedInstanceId ? chalk.cyan(" ATTACHED") : "";
				const pending = instance.pendingInput ? chalk.yellow(" INPUT") : "";
				const branch = safeText(instance.workspace?.branch, safeText(instance.workspace?.worktreeRoot));
				const label = safeText(instance.label, "untitled");
				const state = instance.lifecycleState.toLowerCase().replaceAll("_", "-");
				const row = `${marker} ${chalk.bold(label)} ${chalk.gray(instance.id.slice(0, 8))}  ${statusColor(instance.lifecycleState, state)}  ${chalk.gray(formatElapsed(instance.createdAt, this.now()))}  ${chalk.dim(branch)}${pending}${attached}`;
				lines.push(truncateToWidth(row, width));
			}
		}
		const selected = this.selectedInstance();
		if (selected) {
			lines.push(chalk.gray("─".repeat(width)));
			lines.push(
				truncateToWidth(
					`  ${chalk.cyan("ACTIVITY")}  ${safeText(selected.currentActivity, selected.status)}  ${chalk.gray(safeText(selected.cwd))}`,
					width,
				),
			);
			const output = selected.id === this.attachedInstanceId ? this.attachedOutput : (selected.latestOutput ?? "");
			lines.push(truncateToWidth(`  ${chalk.gray("LATEST")}    ${safeText(output, "No output yet")}`, width));
			if (selected.stateDiagnostic) {
				lines.push(truncateToWidth(`  ${chalk.red("STATE")}     ${safeText(selected.stateDiagnostic)}`, width));
			}
		}
		if (this.pendingUiRequest) {
			lines.push(chalk.gray("─".repeat(width)));
			const request = this.pendingUiRequest;
			const requestTitle = "title" in request && typeof request.title === "string" ? request.title : "Request";
			lines.push(truncateToWidth(chalk.yellow(`  INPUT REQUIRED  ${safeText(requestTitle)}`), width));
			if (request.method === "confirm") lines.push(truncateToWidth(`  ${safeText(request.message)}  [Y/N]`, width));
			if (request.method === "select") {
				const firstVisibleOption = Math.max(
					0,
					Math.min(this.pendingSelection - 2, Math.max(0, request.options.length - 6)),
				);
				const visibleOptions = request.options.slice(firstVisibleOption, firstVisibleOption + 6);
				for (let offset = 0; offset < visibleOptions.length; offset++) {
					const index = firstVisibleOption + offset;
					lines.push(
						truncateToWidth(
							`  ${index === this.pendingSelection ? chalk.cyan("›") : " "} ${safeText(visibleOptions[offset])}`,
							width,
						),
					);
				}
				if (request.options.length > visibleOptions.length) {
					lines.push(
						chalk.dim(
							`  ${firstVisibleOption + 1}-${firstVisibleOption + visibleOptions.length} of ${request.options.length}`,
						),
					);
				}
			}
		}
		if (this.input) {
			lines.push(chalk.gray("─".repeat(width)));
			lines.push(
				chalk.cyan(
					this.inputPurpose === "prompt" ? "  PROMPT" : this.inputPurpose === "search" ? "  SEARCH" : "  RESPONSE",
				),
			);
			lines.push(...this.input.render(Math.max(1, width - 2)).map((line) => `  ${line}`));
		}
		if (this.query) lines.push(truncateToWidth(`  ${chalk.cyan("SEARCH")}  ${safeText(this.query)}`, width));
		lines.push(chalk.gray("─".repeat(width)));
		lines.push(
			truncateToWidth(
				`  ${chalk.cyan("↑↓")} select  ${chalk.cyan("/")} search  ${chalk.cyan("A/Enter")} attach  ${chalk.cyan("D")} detach  ${chalk.cyan("P")} prompt  ${chalk.yellow("C")} cancel  ${chalk.red("S×2")} stop  ${chalk.cyan("R")} refresh  ${chalk.cyan("Q")} quit`,
				width,
			),
		);
		lines.push(
			truncateToWidth(`  ${this.busy ? chalk.cyan("Working") : chalk.dim(safeText(this.statusMessage))}`, width),
		);
		return lines;
	}

	invalidate(): void {
		this.input?.invalidate();
	}

	dispose(): void {
		this.detach();
	}
}

export async function runMaestroDashboard(
	client: MaestroDashboardClient = new IpcMaestroDashboardClient(),
	options: { initialQuery?: string; initialSelector?: string } = {},
): Promise<void> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Maestro TUI requires an interactive terminal");
	const terminal = new ProcessTerminal();
	const tui = new TuiMainScreen(terminal);
	let stopped = false;
	const dashboard = new MaestroDashboard({
		client,
		requestRender: () => tui.requestRender(),
		onQuit: () => {
			stopped = true;
		},
		initialQuery: options.initialQuery,
		initialSelector: options.initialSelector,
	});
	tui.addChild(dashboard);
	tui.setFocus(dashboard);
	tui.start();
	await dashboard.refresh();
	const refreshTimer = setInterval(() => {
		void dashboard.refresh();
	}, REFRESH_INTERVAL_MS);
	refreshTimer.unref();
	try {
		while (!stopped) await new Promise((resolve) => setTimeout(resolve, 25));
	} finally {
		clearInterval(refreshTimer);
		dashboard.dispose();
		tui.stop();
	}
}
