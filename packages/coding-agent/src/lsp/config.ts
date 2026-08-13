/**
 * LSP configuration and server discovery adapted from can1357/oh-my-pi (MIT).
 * Recode keeps the same defaults while using portable Node APIs and Recode's
 * existing JSON/YAML config locations.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { minimatch } from "minimatch";
import { parse as parseYaml } from "yaml";
import { getAgentDir } from "../config.ts";
import DEFAULTS from "./defaults.ts";
import type { LspServerConfig } from "./types.ts";

export interface LspConfig {
	servers: Record<string, LspServerConfig>;
	idleTimeoutMs?: number;
}

export interface LspControlSettings {
	enabled?: boolean;
	lspmux?: boolean;
	projectOnly?: boolean;
	servers?: Record<string, boolean>;
}

interface RawServerConfig extends Partial<LspServerConfig> {
	extensionToLanguage?: unknown;
	initializationOptions?: unknown;
}

interface NormalizedConfig {
	servers: Record<string, RawServerConfig>;
	idleTimeoutMs?: number;
}

const CONFIG_FILENAMES = ["lsp.json", ".lsp.json", "lsp.yaml", ".lsp.yaml", "lsp.yml", ".lsp.yml"];
const PID_TOKEN = "$PID";
const WINDOWS_EXECUTABLE_EXTENSIONS = ["", ".exe", ".cmd", ".bat"] as const;
const PYTHON_ROOT_MARKERS = [
	"pyproject.toml",
	"requirements.txt",
	"setup.py",
	"setup.cfg",
	"Pipfile",
	"pyrightconfig.json",
	"ruff.toml",
	".ruff.toml",
];
const LOCAL_BIN_PATHS: Array<{ markers: string[]; binDir: string }> = [
	{ markers: ["package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"], binDir: "node_modules/.bin" },
	{ markers: PYTHON_ROOT_MARKERS, binDir: ".venv/bin" },
	{ markers: PYTHON_ROOT_MARKERS, binDir: ".venv/Scripts" },
	{ markers: PYTHON_ROOT_MARKERS, binDir: "venv/bin" },
	{ markers: PYTHON_ROOT_MARKERS, binDir: "venv/Scripts" },
	{ markers: ["Gemfile", "Gemfile.lock"], binDir: "vendor/bundle/bin" },
	{ markers: ["Gemfile", "Gemfile.lock"], binDir: "bin" },
	{ markers: ["go.mod", "go.sum", "go.work"], binDir: "bin" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const items = value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
	return items.length > 0 ? items : null;
}

function normalizeExtensionFileTypes(value: unknown): string[] | null {
	if (!isRecord(value)) return null;
	const extensions = Object.keys(value).filter(Boolean);
	return extensions.length > 0 ? extensions : null;
}

function normalizeServerConfig(config: RawServerConfig): LspServerConfig | null {
	const command = typeof config.command === "string" && config.command.length > 0 ? config.command : null;
	const fileTypes = normalizeStringArray(config.fileTypes) ?? normalizeExtensionFileTypes(config.extensionToLanguage);
	const rootMarkers = normalizeStringArray(config.rootMarkers) ?? (config.extensionToLanguage ? ["."] : null);
	if (!command || !fileTypes || !rootMarkers) return null;
	const args = Array.isArray(config.args)
		? config.args.filter((entry): entry is string => typeof entry === "string")
		: undefined;
	const initOptions = isRecord(config.initOptions)
		? config.initOptions
		: isRecord(config.initializationOptions)
			? config.initializationOptions
			: undefined;
	return { ...config, command, args, fileTypes, rootMarkers, ...(initOptions ? { initOptions } : {}) };
}

function normalizeConfig(value: unknown): NormalizedConfig | null {
	if (!isRecord(value)) return null;
	const idleTimeoutMs = typeof value.idleTimeoutMs === "number" ? value.idleTimeoutMs : undefined;
	if (isRecord(value.servers)) {
		return { servers: value.servers as Record<string, RawServerConfig>, idleTimeoutMs };
	}
	const servers = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "idleTimeoutMs")) as Record<
		string,
		RawServerConfig
	>;
	return { servers, idleTimeoutMs };
}

function readConfigFile(filePath: string): NormalizedConfig | null {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const extension = path.extname(filePath).toLowerCase();
		const value: unknown = extension === ".yaml" || extension === ".yml" ? parseYaml(content) : JSON.parse(content);
		return normalizeConfig(value);
	} catch {
		return null;
	}
}

function coerceServerConfigs(servers: Record<string, RawServerConfig>): Record<string, LspServerConfig> {
	const result: Record<string, LspServerConfig> = {};
	for (const [name, config] of Object.entries(servers)) {
		const normalized = normalizeServerConfig(config);
		if (normalized) result[name] = normalized;
	}
	return result;
}

function mergeServers(
	base: Record<string, LspServerConfig>,
	overrides: Record<string, RawServerConfig>,
): Record<string, LspServerConfig> {
	const merged = { ...base };
	for (const [name, override] of Object.entries(overrides)) {
		const normalized = normalizeServerConfig({ ...merged[name], ...override });
		if (normalized) merged[name] = normalized;
	}
	return merged;
}

function applyRuntimeDefaults(servers: Record<string, LspServerConfig>): Record<string, LspServerConfig> {
	const updated = { ...servers };
	if (updated.omnisharp?.args) {
		updated.omnisharp = {
			...updated.omnisharp,
			args: updated.omnisharp.args.map((argument) => (argument === PID_TOKEN ? String(process.pid) : argument)),
		};
	}
	return updated;
}

export function hasRootMarkers(cwd: string, markers: string[]): boolean {
	let entries: string[] | undefined;
	for (const marker of markers) {
		if (marker === ".") return true;
		if (marker.includes("*") || marker.includes("?")) {
			try {
				entries ??= fs.readdirSync(cwd);
				if (entries.some((entry) => minimatch(entry, marker))) return true;
			} catch {
				return false;
			}
			continue;
		}
		if (fs.existsSync(path.join(cwd, marker))) return true;
	}
	return false;
}

export function hasRootMarkerAncestor(filePath: string, markers: string[]): boolean {
	let directory = path.dirname(path.resolve(filePath));
	while (true) {
		if (hasRootMarkers(directory, markers)) return true;
		const parent = path.dirname(directory);
		if (parent === directory) return false;
		directory = parent;
	}
}

function resolveLocalExecutable(basePath: string): string | null {
	const extensions = process.platform === "win32" ? WINDOWS_EXECUTABLE_EXTENSIONS : [""];
	for (const extension of extensions) {
		const candidate = `${basePath}${extension}`;
		if (fs.existsSync(candidate)) return path.resolve(candidate);
	}
	return null;
}

function resolveFromLocalRoot(command: string, root: string): string | null {
	for (const { markers, binDir } of LOCAL_BIN_PATHS) {
		if (!hasRootMarkers(root, markers)) continue;
		const resolved = resolveLocalExecutable(path.join(root, binDir, command));
		if (resolved) return resolved;
	}
	return null;
}

export function resolveCommand(command: string, cwd: string, localRoots: readonly string[] = [cwd]): string | null {
	if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
		return resolveLocalExecutable(path.resolve(cwd, command));
	}
	for (const root of localRoots) {
		const resolved = resolveFromLocalRoot(command, root);
		if (resolved) return resolved;
	}
	for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
		const normalizedDirectory = directory.trim().replace(/^"|"$/g, "");
		if (!normalizedDirectory) continue;
		const resolved = resolveLocalExecutable(path.join(normalizedDirectory, command));
		if (resolved) return resolved;
	}
	return null;
}

function getConfigPaths(cwd: string, agentDir: string): string[] {
	const directories = [cwd, path.join(cwd, ".pi"), agentDir, os.homedir()];
	return directories.flatMap((directory) => CONFIG_FILENAMES.map((filename) => path.join(directory, filename)));
}

export function loadLspConfig(
	cwd: string,
	agentDir: string = getAgentDir(),
	controls: LspControlSettings = {},
): LspConfig {
	if (controls.enabled === false) return { servers: {} };
	let servers = coerceServerConfigs(DEFAULTS as unknown as Record<string, RawServerConfig>);
	let idleTimeoutMs: number | undefined;
	let hasOverrides = false;
	for (const configPath of getConfigPaths(cwd, agentDir).reverse()) {
		const config = readConfigFile(configPath);
		if (!config) continue;
		if (Object.keys(config.servers).length > 0) {
			hasOverrides = true;
			servers = mergeServers(servers, config.servers);
		}
		if (config.idleTimeoutMs !== undefined) idleTimeoutMs = config.idleTimeoutMs;
	}
	const available: Record<string, LspServerConfig> = {};
	for (const [name, config] of Object.entries(applyRuntimeDefaults(servers))) {
		if (controls.servers?.[name] === false || config.disabled || !hasRootMarkers(cwd, config.rootMarkers ?? []))
			continue;
		const resolvedCommand = resolveCommand(config.command, cwd);
		if (!resolvedCommand) continue;
		available[name] = {
			...config,
			resolvedCommand,
			...(controls.projectOnly === true ? { projectOnly: true } : {}),
			...(controls.lspmux === false ? { useLspmux: false } : {}),
		};
	}
	if (!hasOverrides && Object.keys(available).length === 0) return { servers: {}, idleTimeoutMs };
	return { servers: available, idleTimeoutMs };
}

export function getServersForFile(
	config: LspConfig,
	filePath: string,
	options: { includeLinters?: boolean } = {},
): Array<[string, LspServerConfig]> {
	const extension = path.extname(filePath).toLowerCase();
	const extensionWithoutDot = extension.startsWith(".") ? extension.slice(1) : extension;
	const fileName = path.basename(filePath).toLowerCase();
	const matches = Object.entries(config.servers).filter(
		([, server]) =>
			(options.includeLinters !== false || !server.isLinter) &&
			server.fileTypes.some((fileType) => {
				const normalized = fileType.toLowerCase();
				const withoutDot = normalized.startsWith(".") ? normalized.slice(1) : normalized;
				return normalized === extension || normalized === fileName || withoutDot === extensionWithoutDot;
			}),
	);
	return matches.sort((left, right) => Number(Boolean(left[1].isLinter)) - Number(Boolean(right[1].isLinter)));
}

export function getServerForFile(config: LspConfig, filePath: string): [string, LspServerConfig] | null {
	return getServersForFile(config, filePath)[0] ?? null;
}

export function hasCapability(
	config: LspServerConfig,
	capability: keyof NonNullable<LspServerConfig["capabilities"]>,
): boolean {
	return config.capabilities?.[capability] === true;
}
