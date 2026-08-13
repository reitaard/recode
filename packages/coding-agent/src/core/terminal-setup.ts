import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	REPI_TERMINAL_BINDING_SEQUENCES,
	type RepiTerminalBinding,
	type Terminal,
	type TerminalKeyboardProtocol,
} from "@reitaard/recode-tui";

export type TerminalSetupTarget = "windows-terminal" | "vscode";

type SetupPlatform = NodeJS.Platform;

type JsonObject = { [key: string]: unknown };

type SupportedPlan = {
	supported: true;
	target: TerminalSetupTarget;
	configPath: string;
	before: string;
	after: string;
	diff: string;
	changes: string[];
};

type UnsupportedPlan = {
	supported: false;
	target: TerminalSetupTarget;
	message: string;
};

export type TerminalSetupPlan = SupportedPlan | UnsupportedPlan;

export interface TerminalSetupApplyResult {
	configPath: string;
	backupPath: string;
}

type TerminalKeyboardStatus = {
	protocol: TerminalKeyboardProtocol;
	confirmed: Record<RepiTerminalBinding, boolean>;
};
type TerminalWithKeyboardStatus = Terminal & {
	getKeyboardProtocolStatus?: () => TerminalKeyboardStatus;
};

const WINDOWS_TERMINAL_PACKAGE_PATH = "Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json";
const WINDOWS_TERMINAL_UNPACKAGED_PATH = "Microsoft/Windows Terminal/settings.json";

const WINDOWS_TERMINAL_BINDINGS: ReadonlyArray<{ key: string; input: string; label: string }> = [
	{ key: "shift+enter", input: REPI_TERMINAL_BINDING_SEQUENCES.shiftEnter, label: "Shift+Enter" },
	{ key: "alt+enter", input: REPI_TERMINAL_BINDING_SEQUENCES.altEnter, label: "Alt+Enter" },
	{ key: "alt+up", input: REPI_TERMINAL_BINDING_SEQUENCES.altUp, label: "Alt+Up" },
	{ key: "ctrl+v", input: REPI_TERMINAL_BINDING_SEQUENCES.ctrlV, label: "Ctrl+V" },
	{ key: "ctrl+z", input: REPI_TERMINAL_BINDING_SEQUENCES.ctrlZ, label: "Ctrl+Z" },
];

const VSCODE_BINDINGS: ReadonlyArray<{ key: string; text: string; label: string }> = [
	{ key: "shift+enter", text: REPI_TERMINAL_BINDING_SEQUENCES.shiftEnter, label: "Shift+Enter" },
	{ key: "alt+enter", text: REPI_TERMINAL_BINDING_SEQUENCES.altEnter, label: "Alt+Enter" },
	{ key: "alt+up", text: REPI_TERMINAL_BINDING_SEQUENCES.altUp, label: "Alt+Up" },
	{ key: "ctrl+v", text: REPI_TERMINAL_BINDING_SEQUENCES.ctrlV, label: "Ctrl+V" },
	{ key: "ctrl+z", text: REPI_TERMINAL_BINDING_SEQUENCES.ctrlZ, label: "Ctrl+Z" },
];

function windowsTerminalCandidates(env: NodeJS.ProcessEnv): string[] {
	const localAppData = env.LOCALAPPDATA;
	if (!localAppData) return [];
	return [join(localAppData, WINDOWS_TERMINAL_PACKAGE_PATH), join(localAppData, WINDOWS_TERMINAL_UNPACKAGED_PATH)];
}

function vscodeCandidates(env: NodeJS.ProcessEnv, platform: SetupPlatform): string[] {
	if (env.VSCODE_PORTABLE) {
		return [
			join(env.VSCODE_PORTABLE, "User", "keybindings.json"),
			join(env.VSCODE_PORTABLE, "user-data", "User", "keybindings.json"),
			join(env.VSCODE_PORTABLE, "data", "user-data", "User", "keybindings.json"),
		];
	}
	if (platform === "win32") {
		return env.APPDATA ? [join(env.APPDATA, "Code", "User", "keybindings.json")] : [];
	}
	if (platform === "darwin") {
		return [join(homedir(), "Library", "Application Support", "Code", "User", "keybindings.json")];
	}
	const configHome = env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return [join(configHome, "Code", "User", "keybindings.json")];
}

export function findTerminalSetupConfigPath(
	target: TerminalSetupTarget,
	env: NodeJS.ProcessEnv = process.env,
	platform: SetupPlatform = process.platform,
): string | undefined {
	const candidates = target === "windows-terminal" ? windowsTerminalCandidates(env) : vscodeCandidates(env, platform);
	return candidates.find((candidate) => existsSync(candidate));
}

function maskJsonComments(source: string): string {
	let result = "";
	let inString = false;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	for (let index = 0; index < source.length; index++) {
		const character = source[index]!;
		const next = source[index + 1];
		if (lineComment) {
			if (character === "\n" || character === "\r") {
				lineComment = false;
				result += character;
			} else {
				result += " ";
			}
			continue;
		}
		if (blockComment) {
			if (character === "*" && next === "/") {
				result += "  ";
				index++;
				blockComment = false;
			} else {
				result += character === "\n" || character === "\r" ? character : " ";
			}
			continue;
		}
		if (inString) {
			result += character;
			if (escaped) {
				escaped = false;
			} else if (character === "\\") {
				escaped = true;
			} else if (character === '"') {
				inString = false;
			}
			continue;
		}
		if (character === '"') {
			inString = true;
			result += character;
		} else if (character === "/" && next === "/") {
			lineComment = true;
			result += "  ";
			index++;
		} else if (character === "/" && next === "*") {
			blockComment = true;
			result += "  ";
			index++;
		} else {
			result += character;
		}
	}
	return result;
}

function parseJsonc(source: string): unknown {
	const masked = maskJsonComments(source).replace(/,\s*([}\]])/g, "$1");
	return JSON.parse(masked) as unknown;
}

function findClosingBracket(source: string, openingIndex: number, opening: string, closing: string): number {
	const scanSource = maskJsonComments(source);
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = openingIndex; index < scanSource.length; index++) {
		const character = scanSource[index]!;
		if (inString) {
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') inString = false;
			continue;
		}
		if (character === '"') {
			inString = true;
		} else if (character === opening) {
			depth++;
		} else if (character === closing) {
			depth--;
			if (depth === 0) return index;
		}
	}
	return -1;
}

function lineIndent(source: string, index: number): string {
	const lineStart = source.lastIndexOf("\n", index - 1) + 1;
	const match = source.slice(lineStart, index).match(/^[ \t]*/);
	return match?.[0] ?? "";
}

function newlineFor(source: string): string {
	return source.includes("\r\n") ? "\r\n" : "\n";
}

function indentJson(value: JsonObject, indent: string, newline: string): string {
	return JSON.stringify(value, null, 2)
		.split("\n")
		.map((line) => `${indent}${line}`)
		.join(newline);
}

function appendToArray(source: string, arrayStart: number, arrayEnd: number, entries: JsonObject[]): string {
	if (entries.length === 0) return source;
	const newline = newlineFor(source);
	const closingIndent = lineIndent(source, arrayEnd);
	const entryIndent = `${closingIndent}\t`;
	const lastContent = source.slice(arrayStart + 1, arrayEnd).trim();
	const separator = lastContent ? `,${newline}` : newline;
	const entryText = entries.map((entry) => indentJson(entry, entryIndent, newline)).join(`,${newline}`);
	return `${source.slice(0, arrayEnd)}${separator}${entryText}${newline}${closingIndent}${source.slice(arrayEnd)}`;
}

function appendActionsProperty(source: string, objectEnd: number, entries: JsonObject[]): string {
	const newline = newlineFor(source);
	const closingIndent = lineIndent(source, objectEnd);
	const entryIndent = `${closingIndent}\t`;
	const entryText = entries.map((entry) => indentJson(entry, entryIndent, newline)).join(`,${newline}`);
	const property = `"actions": [${newline}${entryText}${newline}${entryIndent.slice(0, -1)}]`;
	const before = source.slice(0, objectEnd);
	const lastContent = before.trim();
	const separator = lastContent.endsWith("{") ? newline : `,${newline}`;
	return `${before}${separator}${property}${newline}${closingIndent}${source.slice(objectEnd)}`;
}

function createUnifiedDiff(before: string, after: string, path: string): string {
	if (before === after) return "No changes are needed.";
	const oldLines = before.split(/\r?\n/);
	const newLines = after.split(/\r?\n/);
	const lines = [`--- ${path}`, `+++ ${path}`, "@@"];
	for (const line of oldLines) lines.push(`- ${line}`);
	for (const line of newLines) lines.push(`+ ${line}`);
	return lines.join("\n");
}

function readConfig(configPath: string): string | undefined {
	try {
		return readFileSync(configPath, "utf8");
	} catch {
		return undefined;
	}
}

function createWindowsTerminalPlan(configPath: string, before: string): SupportedPlan | UnsupportedPlan {
	let parsed: unknown;
	try {
		parsed = parseJsonc(before);
	} catch {
		return {
			supported: false,
			target: "windows-terminal",
			message: `Could not parse ${configPath}; no changes were made.`,
		};
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return {
			supported: false,
			target: "windows-terminal",
			message: `Windows Terminal settings must be a JSON object: ${configPath}`,
		};
	}
	const root = parsed as JsonObject;
	const actions = Array.isArray(root.actions) ? root.actions : [];
	const missing = WINDOWS_TERMINAL_BINDINGS.filter(
		(binding) =>
			!actions.some((action) => {
				if (typeof action !== "object" || action === null || Array.isArray(action)) return false;
				const item = action as JsonObject;
				const command = item.command;
				return (
					item.keys === binding.key &&
					typeof command === "object" &&
					command !== null &&
					(command as JsonObject).action === "sendInput" &&
					(command as JsonObject).input === binding.input
				);
			}),
	);
	if (missing.length === 0) {
		return {
			supported: true,
			target: "windows-terminal",
			configPath,
			before,
			after: before,
			diff: "No changes are needed.",
			changes: [],
		};
	}
	const entries = missing.map((binding) => ({
		command: { action: "sendInput", input: binding.input },
		keys: binding.key,
	}));
	let after: string;
	if (Array.isArray(root.actions)) {
		const actionsKey = before.indexOf('"actions"');
		const arrayStart = actionsKey < 0 ? -1 : before.indexOf("[", actionsKey);
		const arrayEnd = arrayStart < 0 ? -1 : findClosingBracket(before, arrayStart, "[", "]");
		if (arrayStart < 0 || arrayEnd < 0) {
			return {
				supported: false,
				target: "windows-terminal",
				message: `Could not locate the actions array in ${configPath}.`,
			};
		}
		after = appendToArray(before, arrayStart, arrayEnd, entries);
	} else {
		const objectEnd = findClosingBracket(before, before.indexOf("{"), "{", "}");
		if (objectEnd < 0) {
			return {
				supported: false,
				target: "windows-terminal",
				message: `Could not locate the settings object in ${configPath}.`,
			};
		}
		after = appendActionsProperty(before, objectEnd, entries);
	}
	return {
		supported: true,
		target: "windows-terminal",
		configPath,
		before,
		after,
		diff: createUnifiedDiff(before, after, configPath),
		changes: missing.map((binding) => `${binding.label} → Windows Terminal sendInput`),
	};
}

function createVscodePlan(configPath: string, before: string): SupportedPlan | UnsupportedPlan {
	let parsed: unknown;
	try {
		parsed = parseJsonc(before);
	} catch {
		return { supported: false, target: "vscode", message: `Could not parse ${configPath}; no changes were made.` };
	}
	if (!Array.isArray(parsed)) {
		return { supported: false, target: "vscode", message: `VS Code keybindings must be a JSON array: ${configPath}` };
	}
	const missing = VSCODE_BINDINGS.filter(
		(binding) =>
			!parsed.some((entry) => {
				if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
				const item = entry as JsonObject;
				const args = item.args;
				return (
					item.key === binding.key &&
					item.command === "workbench.action.terminal.sendSequence" &&
					item.when === "terminalFocus" &&
					typeof args === "object" &&
					args !== null &&
					(args as JsonObject).text === binding.text
				);
			}),
	);
	if (missing.length === 0) {
		return {
			supported: true,
			target: "vscode",
			configPath,
			before,
			after: before,
			diff: "No changes are needed.",
			changes: [],
		};
	}
	const entries = missing.map((binding) => ({
		key: binding.key,
		command: "workbench.action.terminal.sendSequence",
		args: { text: binding.text },
		when: "terminalFocus",
	}));
	const arrayStart = before.indexOf("[");
	const arrayEnd = arrayStart < 0 ? -1 : findClosingBracket(before, arrayStart, "[", "]");
	if (arrayStart < 0 || arrayEnd < 0) {
		return {
			supported: false,
			target: "vscode",
			message: `Could not locate the keybindings array in ${configPath}.`,
		};
	}
	const after = appendToArray(before, arrayStart, arrayEnd, entries);
	return {
		supported: true,
		target: "vscode",
		configPath,
		before,
		after,
		diff: createUnifiedDiff(before, after, configPath),
		changes: missing.map((binding) => `${binding.label} → VS Code terminalFocus sendSequence`),
	};
}

export function createTerminalSetupPlan(
	target: TerminalSetupTarget,
	options: { configPath?: string; env?: NodeJS.ProcessEnv; platform?: SetupPlatform } = {},
): TerminalSetupPlan {
	const configPath = options.configPath ?? findTerminalSetupConfigPath(target, options.env, options.platform);
	if (!configPath) {
		const product = target === "vscode" ? "VS Code Integrated Terminal" : "Windows Terminal";
		return {
			supported: false,
			target,
			message: `Could not find a ${product} configuration file. Create or open it first, then run /tui-setup apply ${target}.`,
		};
	}
	const before = readConfig(configPath);
	if (before === undefined) {
		return { supported: false, target, message: `Could not read ${configPath}; no changes were made.` };
	}
	return target === "vscode" ? createVscodePlan(configPath, before) : createWindowsTerminalPlan(configPath, before);
}

function nextBackupPath(configPath: string): string {
	const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
	let candidate = `${configPath}.recode-backup-${stamp}`;
	let suffix = 1;
	while (existsSync(candidate)) {
		candidate = `${configPath}.recode-backup-${stamp}-${suffix}`;
		suffix++;
	}
	return candidate;
}

export function applyTerminalSetup(plan: SupportedPlan): TerminalSetupApplyResult {
	if (plan.before === plan.after) {
		return { configPath: plan.configPath, backupPath: "" };
	}
	const current = readConfig(plan.configPath);
	if (current !== plan.before) {
		throw new Error(`Configuration changed since the preview was created: ${plan.configPath}`);
	}
	const backupPath = nextBackupPath(plan.configPath);
	mkdirSync(dirname(plan.configPath), { recursive: true });
	copyFileSync(plan.configPath, backupPath);
	writeFileSync(plan.configPath, plan.after, "utf8");
	return { configPath: plan.configPath, backupPath };
}

function protocolLabel(protocol: TerminalKeyboardProtocol): string {
	return protocol === "modifyOtherKeys" ? "modifyOtherKeys" : protocol;
}

export function formatTerminalKeyboardReport(terminal: Terminal): string {
	const terminalWithKeyboardStatus = terminal as TerminalWithKeyboardStatus;
	const status = terminalWithKeyboardStatus.getKeyboardProtocolStatus?.() ?? {
		protocol: terminal.kittyProtocolActive ? "kitty" : "legacy",
		confirmed: {
			shiftEnter: false,
			altEnter: false,
			altUp: false,
			ctrlV: false,
			ctrlZ: false,
		},
	};
	const labels: ReadonlyArray<[RepiTerminalBinding, string]> = [
		["shiftEnter", "Shift+Enter"],
		["altEnter", "Alt+Enter"],
		["altUp", "Alt+Up"],
		["ctrlV", "Ctrl+V"],
		["ctrlZ", "Ctrl+Z"],
	];
	const lines = [`Keyboard protocol: ${protocolLabel(status.protocol)}`];
	for (const [binding, label] of labels) {
		lines.push(`  ${label}: ${status.confirmed[binding] ? "confirmed" : "not confirmed"}`);
	}
	if (status.protocol === "legacy" || labels.some(([binding]) => !status.confirmed[binding])) {
		lines.push(
			"A terminal that cannot send distinct modified keys may not support every Recode binding. Run /tui-setup apply windows-terminal or /tui-setup apply vscode when applicable.",
		);
	}
	return lines.join("\n");
}
