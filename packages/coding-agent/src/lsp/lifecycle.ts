/**
 * Workspace-scoped LSP lifecycle management.
 *
 * Lazy activation, idle shutdown, configuration reconciliation, and bounded
 * crash recovery live here so protocol clients remain focused on one process.
 */

import * as path from "node:path";
import {
	getActiveLspClients,
	getLspClientKey,
	getOrCreateClient,
	type LspClientStateEvent,
	shutdownAllLspClients,
	shutdownLspClient,
	shutdownLspClientsForCwd,
	subscribeLspClientState,
} from "./client.ts";
import type { LspConfig } from "./config.ts";
import { clearAllLspDiagnosticSnapshots, clearLspDiagnosticSnapshotsForCwd } from "./diagnostics.ts";
import type { LspServerConfig, LspServerStatus } from "./types.ts";

const DEFAULT_CONFIG_POLL_INTERVAL_MS = 2_000;
const DEFAULT_RESTART_BASE_DELAY_MS = 750;
const DEFAULT_RESTART_STABILITY_MS = 30_000;
const MAX_RESTART_ATTEMPTS = 3;

export interface StartLspLifecycleOptions {
	cwd: string;
	config: LspConfig;
	loadConfig?: () => LspConfig;
	configPollIntervalMs?: number;
	restartBaseDelayMs?: number;
	restartStabilityMs?: number;
}

export interface LspLifecycleEvent {
	cwd: string;
	server: LspServerStatus;
}

export type LspLifecycleListener = (event: LspLifecycleEvent) => void;

interface WorkspaceLifecycle {
	cwd: string;
	config: LspConfig;
	fingerprint: string;
	loadConfig?: () => LspConfig;
	configPollIntervalMs: number;
	restartBaseDelayMs: number;
	restartStabilityMs: number;
	generation: number;
	statuses: Map<string, LspServerStatus>;
	restartAttempts: Map<string, number>;
	readyAt: Map<string, number>;
	restartTimers: Map<string, NodeJS.Timeout>;
	pollTimer?: NodeJS.Timeout;
	polling: boolean;
	operation: Promise<void>;
}

const workspaces = new Map<string, WorkspaceLifecycle>();
const listeners = new Set<LspLifecycleListener>();

function workspaceKey(cwd: string): string {
	return path.resolve(cwd);
}

function normalizeForFingerprint(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalizeForFingerprint);
	if (typeof value !== "object" || value === null) return value;
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, normalizeForFingerprint(entry)]),
	);
}

function configFingerprint(config: LspConfig): string {
	return JSON.stringify(normalizeForFingerprint(config));
}

function createStatus(name: string, config: LspServerConfig): LspServerStatus {
	return { name, state: "unstarted", fileTypes: [...config.fileTypes] };
}

function emitStatus(workspace: WorkspaceLifecycle, status: LspServerStatus): void {
	workspace.statuses.set(status.name, status);
	for (const listener of listeners) listener({ cwd: workspace.cwd, server: { ...status } });
}

function serverNameForKey(workspace: WorkspaceLifecycle, key: string): string | undefined {
	return Object.entries(workspace.config.servers).find(
		([, config]) => getLspClientKey(config, workspace.cwd) === key,
	)?.[0];
}

function clearRestartTimer(workspace: WorkspaceLifecycle, name: string): void {
	const timer = workspace.restartTimers.get(name);
	if (timer) clearTimeout(timer);
	workspace.restartTimers.delete(name);
}

function clearRestartTimers(workspace: WorkspaceLifecycle): void {
	for (const timer of workspace.restartTimers.values()) clearTimeout(timer);
	workspace.restartTimers.clear();
}

function scheduleRestart(workspace: WorkspaceLifecycle, name: string, error: string): void {
	if (workspace.restartTimers.has(name)) return;
	const config = workspace.config.servers[name];
	if (!config) return;
	const readyAt = workspace.readyAt.get(name);
	if (readyAt !== undefined && Date.now() - readyAt >= workspace.restartStabilityMs) {
		workspace.restartAttempts.delete(name);
	}
	workspace.readyAt.delete(name);
	const attempt = (workspace.restartAttempts.get(name) ?? 0) + 1;
	workspace.restartAttempts.set(name, attempt);
	if (attempt > MAX_RESTART_ATTEMPTS) {
		emitStatus(workspace, {
			name,
			state: "error",
			fileTypes: [...config.fileTypes],
			error,
			restartAttempt: MAX_RESTART_ATTEMPTS,
		});
		return;
	}

	const delay = workspace.restartBaseDelayMs * 2 ** (attempt - 1);
	const retryAt = Date.now() + delay;
	emitStatus(workspace, {
		name,
		state: "backoff",
		fileTypes: [...config.fileTypes],
		error,
		restartAttempt: attempt,
		retryAt,
	});
	const generation = workspace.generation;
	const timer = setTimeout(() => {
		workspace.restartTimers.delete(name);
		if (workspaces.get(workspaceKey(workspace.cwd)) !== workspace || workspace.generation !== generation) return;
		emitStatus(workspace, {
			name,
			state: "starting",
			fileTypes: [...config.fileTypes],
			restartAttempt: attempt,
		});
		void getOrCreateClient(config, workspace.cwd, {
			bypassFailureBackoff: true,
			cacheFailure: false,
		}).catch((restartError: unknown) => {
			if (workspace.restartTimers.has(name)) return;
			scheduleRestart(workspace, name, restartError instanceof Error ? restartError.message : String(restartError));
		});
	}, delay);
	timer.unref();
	workspace.restartTimers.set(name, timer);
}

function handleClientState(event: LspClientStateEvent): void {
	const workspace = workspaces.get(workspaceKey(event.cwd));
	if (!workspace) return;
	const name = serverNameForKey(workspace, event.key);
	if (!name) return;
	const config = workspace.config.servers[name];
	if (!config) return;

	if (event.state === "ready") {
		clearRestartTimer(workspace, name);
		workspace.readyAt.set(name, Date.now());
		emitStatus(workspace, { name, state: "ready", fileTypes: [...config.fileTypes] });
		return;
	}
	if (event.state === "error") {
		scheduleRestart(workspace, name, event.error ?? "Language server exited unexpectedly");
		return;
	}
	if (event.state === "stopped") {
		clearRestartTimer(workspace, name);
		workspace.restartAttempts.delete(name);
		workspace.readyAt.delete(name);
		emitStatus(workspace, createStatus(name, config));
		return;
	}
	emitStatus(workspace, {
		name,
		state: event.state,
		fileTypes: [...config.fileTypes],
		...(event.error ? { error: event.error } : {}),
	});
}

subscribeLspClientState(handleClientState);

async function shutdownIdleClients(workspace: WorkspaceLifecycle): Promise<void> {
	const idleTimeoutMs = workspace.config.idleTimeoutMs;
	if (!idleTimeoutMs || idleTimeoutMs <= 0) return;
	const now = Date.now();
	const idleClients = getActiveLspClients().filter(
		(client) =>
			workspaceKey(client.cwd) === workspaceKey(workspace.cwd) && now - client.lastActivity >= idleTimeoutMs,
	);
	await Promise.allSettled(idleClients.map((client) => shutdownLspClient(client.key)));
}

async function reconcileWorkspace(
	workspace: WorkspaceLifecycle,
	config: LspConfig,
	forceRestart: boolean,
): Promise<void> {
	const nextFingerprint = configFingerprint(config);
	const changed = nextFingerprint !== workspace.fingerprint;
	if (!changed && !forceRestart) return;

	workspace.generation += 1;
	clearRestartTimers(workspace);
	workspace.restartAttempts.clear();
	workspace.readyAt.clear();
	workspace.config = config;
	workspace.fingerprint = nextFingerprint;
	clearLspDiagnosticSnapshotsForCwd(workspace.cwd);
	workspace.statuses = new Map(
		Object.entries(config.servers).map(([name, serverConfig]) => [name, createStatus(name, serverConfig)]),
	);
	await shutdownLspClientsForCwd(workspace.cwd);
}

function queueWorkspaceOperation(workspace: WorkspaceLifecycle, operation: () => Promise<void>): Promise<void> {
	workspace.operation = workspace.operation.then(operation, operation);
	return workspace.operation;
}

async function pollWorkspace(workspace: WorkspaceLifecycle): Promise<void> {
	if (workspace.polling || workspaces.get(workspaceKey(workspace.cwd)) !== workspace) return;
	workspace.polling = true;
	try {
		if (workspace.loadConfig) {
			const config = workspace.loadConfig();
			if (configFingerprint(config) !== workspace.fingerprint) {
				await queueWorkspaceOperation(workspace, () => reconcileWorkspace(workspace, config, true));
				return;
			}
		}
		await shutdownIdleClients(workspace);
	} finally {
		workspace.polling = false;
	}
}

function ensurePollTimer(workspace: WorkspaceLifecycle): void {
	if (workspace.pollTimer || (!workspace.loadConfig && !workspace.config.idleTimeoutMs)) return;
	workspace.pollTimer = setInterval(() => {
		void pollWorkspace(workspace).catch(() => {});
	}, workspace.configPollIntervalMs);
	workspace.pollTimer.unref();
}

export async function startLspLifecycle(options: StartLspLifecycleOptions): Promise<void> {
	const key = workspaceKey(options.cwd);
	let workspace = workspaces.get(key);
	if (!workspace) {
		workspace = {
			cwd: key,
			config: options.config,
			fingerprint: configFingerprint(options.config),
			loadConfig: options.loadConfig,
			configPollIntervalMs: options.configPollIntervalMs ?? DEFAULT_CONFIG_POLL_INTERVAL_MS,
			restartBaseDelayMs: options.restartBaseDelayMs ?? DEFAULT_RESTART_BASE_DELAY_MS,
			restartStabilityMs: options.restartStabilityMs ?? DEFAULT_RESTART_STABILITY_MS,
			generation: 0,
			statuses: new Map(
				Object.entries(options.config.servers).map(([name, config]) => [name, createStatus(name, config)]),
			),
			restartAttempts: new Map(),
			readyAt: new Map(),
			restartTimers: new Map(),
			polling: false,
			operation: Promise.resolve(),
		};
		workspaces.set(key, workspace);
	} else {
		workspace.loadConfig = options.loadConfig;
		workspace.configPollIntervalMs = options.configPollIntervalMs ?? workspace.configPollIntervalMs;
		workspace.restartBaseDelayMs = options.restartBaseDelayMs ?? workspace.restartBaseDelayMs;
		workspace.restartStabilityMs = options.restartStabilityMs ?? workspace.restartStabilityMs;
	}
	ensurePollTimer(workspace);
	await queueWorkspaceOperation(workspace, () => reconcileWorkspace(workspace, options.config, false));
}

export function getLspLifecycleStatuses(cwd: string, fallbackConfig?: LspConfig): LspServerStatus[] {
	const workspace = workspaces.get(workspaceKey(cwd));
	if (workspace) return [...workspace.statuses.values()].map((status) => ({ ...status }));
	return Object.entries(fallbackConfig?.servers ?? {}).map(([name, config]) => createStatus(name, config));
}

export function subscribeLspLifecycle(listener: LspLifecycleListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export async function stopLspLifecycleForCwd(cwd: string): Promise<void> {
	const key = workspaceKey(cwd);
	const workspace = workspaces.get(key);
	if (!workspace) {
		clearLspDiagnosticSnapshotsForCwd(cwd);
		await shutdownLspClientsForCwd(cwd);
		return;
	}
	workspaces.delete(key);
	if (workspace.pollTimer) clearInterval(workspace.pollTimer);
	clearRestartTimers(workspace);
	clearLspDiagnosticSnapshotsForCwd(cwd);
	await shutdownLspClientsForCwd(cwd);
}

export async function shutdownAllLspLifecycles(): Promise<void> {
	for (const workspace of workspaces.values()) {
		if (workspace.pollTimer) clearInterval(workspace.pollTimer);
		clearRestartTimers(workspace);
	}
	workspaces.clear();
	clearAllLspDiagnosticSnapshots();
	await shutdownAllLspClients();
}
