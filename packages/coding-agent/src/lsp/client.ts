/**
 * Language-server process client adapted from can1357/oh-my-pi (MIT).
 * Recode uses Node process primitives behind this module so the same code runs
 * under Node during development and inside the Bun-compiled binary.
 */

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { spawnProcess } from "../utils/child-process.ts";
import { sleep } from "../utils/sleep.ts";
import { applyWorkspaceEdit } from "./edits.ts";
import { getLspmuxCommand } from "./lspmux.ts";
import { LspMessageFramer } from "./message-framer.ts";
import type {
	LspClient,
	LspDiagnostic,
	LspJsonRpcNotification,
	LspJsonRpcRequest,
	LspJsonRpcResponse,
	LspPendingRequest,
	LspServerConfig,
	LspWorkspaceEdit,
	PublishDiagnosticsParams,
} from "./types.ts";
import { detectLanguageId, fileToUri } from "./utils.ts";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const INITIALIZE_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const INIT_FAILURE_BACKOFF_MS = 3 * 60 * 1000;
const MAX_STDERR_CHARS = 16_384;
const PROJECT_PROGRESS_SETTLE_MS = 150;
const PROJECT_PROGRESS_TIMEOUT_MS = 3000;
const PROJECT_PROGRESS_POLL_MS = 25;

const clients = new Map<string, LspClient>();
const initializingClients = new Map<string, LspClient>();
const clientLocks = new Map<string, Promise<LspClient>>();
const initFailures = new Map<string, { at: number; message: string }>();
const failedClients = new WeakSet<LspClient>();

export interface LspClientStateEvent {
	key: string;
	cwd: string;
	config: LspServerConfig;
	state: LspClient["state"];
	error?: string;
}

export interface GetOrCreateLspClientOptions {
	initializeTimeoutMs?: number;
	bypassFailureBackoff?: boolean;
	cacheFailure?: boolean;
}

export type LspClientStateListener = (event: LspClientStateEvent) => void;

const stateListeners = new Set<LspClientStateListener>();

function emitClientState(client: LspClient, error?: string): void {
	const event: LspClientStateEvent = {
		key: client.key,
		cwd: client.cwd,
		config: client.config,
		state: client.state,
		...(error ? { error } : {}),
	};
	for (const listener of stateListeners) listener(event);
}

export function subscribeLspClientState(listener: LspClientStateListener): () => void {
	stateListeners.add(listener);
	return () => stateListeners.delete(listener);
}

class LspClientShutdownError extends Error {
	constructor(name: string) {
		super(`LSP server ${name} was stopped during initialization`);
		this.name = "LspClientShutdownError";
	}
}

const CLIENT_CAPABILITIES = {
	textDocument: {
		synchronization: { didSave: true, dynamicRegistration: false },
		hover: { contentFormat: ["markdown", "plaintext"], dynamicRegistration: false },
		definition: { dynamicRegistration: false, linkSupport: true },
		typeDefinition: { dynamicRegistration: false, linkSupport: true },
		implementation: { dynamicRegistration: false, linkSupport: true },
		references: { dynamicRegistration: false },
		documentSymbol: { dynamicRegistration: false, hierarchicalDocumentSymbolSupport: true },
		callHierarchy: { dynamicRegistration: false },
		rename: { dynamicRegistration: false, prepareSupport: true },
		codeAction: { dynamicRegistration: false },
		formatting: { dynamicRegistration: false },
		rangeFormatting: { dynamicRegistration: false },
		publishDiagnostics: { relatedInformation: true, versionSupport: true },
		diagnostic: { dynamicRegistration: false, relatedDocumentSupport: true },
	},
	window: { workDoneProgress: true },
	workspace: {
		applyEdit: true,
		workspaceEdit: {
			documentChanges: true,
			resourceOperations: ["create", "rename", "delete"],
			failureHandling: "textOnlyTransactional",
		},
		configuration: true,
		workspaceFolders: true,
		symbol: { dynamicRegistration: false },
		diagnostics: { refreshSupport: true },
		fileOperations: { willRename: true, didRename: true },
	},
};

export function getLspClientKey(config: LspServerConfig, cwd: string): string {
	return `${config.command}:${path.resolve(cwd)}`;
}

function queueWriteMessage(
	client: LspClient,
	message: LspJsonRpcRequest | LspJsonRpcNotification | LspJsonRpcResponse,
	signal?: AbortSignal,
): Promise<void> {
	const write = client.writeQueue.then(async () => {
		if (signal?.aborted) {
			throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
		}
		if (
			client.state === "error" ||
			client.state === "stopped" ||
			!client.process.stdin.writable ||
			client.process.stdin.destroyed
		) {
			throw new Error(`LSP server ${client.name} is not accepting messages`);
		}
		const content = JSON.stringify(message);
		const frame = `Content-Length: ${Buffer.byteLength(content, "utf-8")}\r\n\r\n${content}`;
		await new Promise<void>((resolve, reject) => {
			client.process.stdin.write(frame, (error?: Error | null) => {
				if (error) reject(error);
				else resolve();
			});
		});
	});
	client.writeQueue = write.catch(() => {});
	if (!signal) return write;
	return new Promise((resolve, reject) => {
		const abort = (): void => {
			signal.removeEventListener("abort", abort);
			reject(signal.reason instanceof Error ? signal.reason : new Error("Operation aborted"));
		};
		signal.addEventListener("abort", abort, { once: true });
		write.then(
			() => {
				signal.removeEventListener("abort", abort);
				resolve();
			},
			(error: unknown) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

function rejectPendingRequests(client: LspClient, error: Error): void {
	for (const pending of client.pendingRequests.values()) pending.reject(error);
	client.pendingRequests.clear();
}

async function sendResponse(
	client: LspClient,
	id: number,
	result: unknown,
	error?: LspJsonRpcResponse["error"],
): Promise<void> {
	await queueWriteMessage(client, { jsonrpc: "2.0", id, ...(error ? { error } : { result }) });
}

async function handleServerRequest(client: LspClient, request: LspJsonRpcRequest): Promise<void> {
	switch (request.method) {
		case "workspace/configuration": {
			const params = request.params as { items?: Array<{ section?: string }> } | undefined;
			const result = (params?.items ?? []).map((item) => client.config.settings?.[item.section ?? ""] ?? {});
			await sendResponse(client, request.id, result);
			return;
		}
		case "workspace/workspaceFolders":
			await sendResponse(client, request.id, [{ uri: fileToUri(client.cwd), name: path.basename(client.cwd) }]);
			return;
		case "window/workDoneProgress/create":
			await sendResponse(client, request.id, null);
			return;
		case "workspace/diagnostic/refresh":
			await sendResponse(client, request.id, null);
			return;
		case "workspace/applyEdit":
			try {
				const params = request.params as { edit?: LspWorkspaceEdit } | undefined;
				if (!params?.edit) throw new Error("workspace/applyEdit did not include an edit");
				await applyWorkspaceEdit(params.edit, client.cwd, { projectOnly: client.config.projectOnly });
				await sendResponse(client, request.id, { applied: true });
			} catch (error) {
				await sendResponse(client, request.id, {
					applied: false,
					failureReason: error instanceof Error ? error.message : String(error),
				});
			}
			return;
		default:
			await sendResponse(client, request.id, null, {
				code: -32601,
				message: `Method not found: ${request.method}`,
			});
	}
}

function handleMessage(client: LspClient, rawMessage: string): void {
	let message: LspJsonRpcResponse | LspJsonRpcNotification | LspJsonRpcRequest;
	try {
		message = JSON.parse(rawMessage) as LspJsonRpcResponse | LspJsonRpcNotification | LspJsonRpcRequest;
	} catch {
		return;
	}
	if ("id" in message && typeof message.id === "number" && !("method" in message)) {
		const pending = client.pendingRequests.get(message.id);
		if (!pending) return;
		client.pendingRequests.delete(message.id);
		if (message.error) pending.reject(new Error(`LSP error: ${message.error.message}`));
		else pending.resolve(message.result);
		return;
	}
	if (!("method" in message)) return;
	if ("id" in message && typeof message.id === "number") {
		void handleServerRequest(client, message as LspJsonRpcRequest).catch(() => {});
		return;
	}
	if (message.method === "textDocument/publishDiagnostics") {
		const params = message.params as PublishDiagnosticsParams;
		const openVersion = client.openFiles.get(params.uri)?.version;
		if (params.version !== undefined && openVersion !== undefined && params.version < openVersion) return;
		client.diagnostics.set(params.uri, {
			diagnostics: params.diagnostics,
			version: params.version ?? null,
		});
		client.diagnosticsVersion += 1;
	} else if (message.method === "$/progress") {
		const params = message.params as { token?: unknown; value?: { kind?: unknown } } | undefined;
		if ((typeof params?.token === "string" || typeof params?.token === "number") && params.value?.kind === "begin") {
			client.activeProgressTokens.add(params.token);
			client.progressVersion += 1;
		} else if (
			(typeof params?.token === "string" || typeof params?.token === "number") &&
			params.value?.kind === "end"
		) {
			client.activeProgressTokens.delete(params.token);
			client.progressVersion += 1;
		}
	}
}

function reportClientFailure(client: LspClient, error: Error): void {
	if (client.state === "stopped" || failedClients.has(client)) return;
	failedClients.add(client);
	client.state = "error";
	clients.delete(client.key);
	initializingClients.delete(client.key);
	rejectPendingRequests(client, error);
	emitClientState(client, error.message);
}

function startMessageReader(client: LspClient): void {
	const framer = new LspMessageFramer();
	client.process.stdout.on("data", (chunk: Buffer) => {
		for (const message of framer.push(chunk)) handleMessage(client, message);
	});
	client.process.stderr.on("data", (chunk: Buffer) => {
		client.stderr = `${client.stderr}${chunk.toString("utf-8")}`.slice(-MAX_STDERR_CHARS);
	});
	client.process.on("close", (code, signal) => {
		if (client.state === "stopped") {
			clients.delete(client.key);
			initializingClients.delete(client.key);
			return;
		}
		const stderr = client.stderr.trim();
		const detail = stderr ? `: ${stderr}` : "";
		reportClientFailure(client, new Error(`LSP server exited (${signal ?? code ?? "unknown"})${detail}`));
	});
	client.process.on("error", (error) => {
		reportClientFailure(client, error);
	});
	client.process.stdin.on("error", (error) => {
		reportClientFailure(client, error);
	});
}

export function sendRequest(
	client: LspClient,
	method: string,
	params: unknown,
	signal?: AbortSignal,
	timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<unknown> {
	if (signal?.aborted) return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("Aborted"));
	const id = ++client.requestId;
	client.lastActivity = Date.now();
	return new Promise((resolve, reject) => {
		let settled = false;
		const cleanup = (): void => {
			if (signal) signal.removeEventListener("abort", abort);
			clearTimeout(timeout);
		};
		const finish = (callback: () => void): void => {
			if (settled) return;
			settled = true;
			cleanup();
			callback();
		};
		const abort = (): void => {
			client.pendingRequests.delete(id);
			void queueWriteMessage(client, { jsonrpc: "2.0", method: "$/cancelRequest", params: { id } }).catch(() => {});
			finish(() => reject(signal?.reason instanceof Error ? signal.reason : new Error("Aborted")));
		};
		const timeout = setTimeout(() => {
			client.pendingRequests.delete(id);
			void queueWriteMessage(client, { jsonrpc: "2.0", method: "$/cancelRequest", params: { id } }).catch(() => {});
			finish(() => reject(new Error(`LSP request ${method} timed out after ${timeoutMs}ms`)));
		}, timeoutMs);
		const pending: LspPendingRequest = {
			method,
			resolve: (value) => finish(() => resolve(value)),
			reject: (error) => finish(() => reject(error)),
		};
		client.pendingRequests.set(id, pending);
		if (signal) signal.addEventListener("abort", abort, { once: true });
		void queueWriteMessage(client, { jsonrpc: "2.0", id, method, params }, signal).catch((error: unknown) => {
			client.pendingRequests.delete(id);
			finish(() => reject(error instanceof Error ? error : new Error(String(error))));
		});
	});
}

export async function sendNotification(client: LspClient, method: string, params: unknown): Promise<void> {
	client.lastActivity = Date.now();
	await queueWriteMessage(client, { jsonrpc: "2.0", method, params });
}

async function createClient(config: LspServerConfig, cwd: string, initializeTimeoutMs?: number): Promise<LspClient> {
	const key = getLspClientKey(config, cwd);
	const command = config.resolvedCommand ?? config.command;
	const wrapped =
		config.useLspmux === false
			? { command, args: config.args ?? [], env: undefined }
			: await getLspmuxCommand(command, config.args);
	const child = spawnProcess(wrapped.command, wrapped.args, {
		cwd,
		env: { ...process.env, ...config.env, ...wrapped.env },
		stdio: ["pipe", "pipe", "pipe"],
		windowsHide: true,
	}) as ChildProcessWithoutNullStreams;
	const client: LspClient = {
		key,
		name: config.command,
		cwd,
		config,
		process: child,
		requestId: 0,
		state: "starting",
		pendingRequests: new Map(),
		diagnostics: new Map(),
		diagnosticsVersion: 0,
		activeProgressTokens: new Set(),
		progressVersion: 0,
		openFiles: new Map(),
		writeQueue: Promise.resolve(),
		stderr: "",
		lastActivity: Date.now(),
	};
	initializingClients.set(key, client);
	emitClientState(client);
	startMessageReader(client);
	try {
		const initialized = (await sendRequest(
			client,
			"initialize",
			{
				processId: process.pid,
				rootUri: fileToUri(cwd),
				rootPath: cwd,
				capabilities: CLIENT_CAPABILITIES,
				initializationOptions: config.initOptions ?? {},
				workspaceFolders: [{ uri: fileToUri(cwd), name: path.basename(cwd) }],
			},
			undefined,
			initializeTimeoutMs ?? config.timeoutMs ?? INITIALIZE_TIMEOUT_MS,
		)) as { capabilities?: Record<string, unknown> };
		client.serverCapabilities = initialized.capabilities;
		await sendNotification(client, "initialized", {});
		await sendNotification(client, "workspace/didChangeConfiguration", { settings: config.settings ?? {} });
		client.state = "ready";
		initializingClients.delete(key);
		clients.set(key, client);
		emitClientState(client);
		return client;
	} catch (error) {
		initializingClients.delete(key);
		const wasStopped = client.state === "stopped";
		if (!wasStopped) {
			const failure = error instanceof Error ? error : new Error(String(error));
			reportClientFailure(client, failure);
		}
		child.kill();
		if (wasStopped) throw new LspClientShutdownError(config.command);
		throw error;
	}
}

export async function getOrCreateClient(
	config: LspServerConfig,
	cwd: string,
	options?: GetOrCreateLspClientOptions,
): Promise<LspClient> {
	const key = getLspClientKey(config, cwd);
	const existing = clients.get(key);
	if (existing) {
		existing.lastActivity = Date.now();
		return existing;
	}
	const pending = clientLocks.get(key);
	if (pending) return pending;
	const recentFailure = options?.bypassFailureBackoff ? undefined : initFailures.get(key);
	if (recentFailure && Date.now() - recentFailure.at < INIT_FAILURE_BACKOFF_MS) {
		throw new Error(`LSP server ${config.command} failed recently: ${recentFailure.message}`);
	}
	const creation = createClient(config, path.resolve(cwd), options?.initializeTimeoutMs)
		.then((client) => {
			initFailures.delete(key);
			return client;
		})
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			if (!(error instanceof LspClientShutdownError) && options?.cacheFailure !== false) {
				initFailures.set(key, { at: Date.now(), message });
			}
			throw error;
		})
		.finally(() => {
			if (clientLocks.get(key) === creation) clientLocks.delete(key);
		});
	clientLocks.set(key, creation);
	return creation;
}

export async function ensureFileOpen(client: LspClient, filePath: string, content?: string): Promise<void> {
	const uri = fileToUri(filePath);
	if (client.openFiles.has(uri)) return;
	const text = content ?? (await readFile(filePath, "utf-8"));
	const languageId = detectLanguageId(filePath);
	await sendNotification(client, "textDocument/didOpen", {
		textDocument: { uri, languageId, version: 1, text },
	});
	client.openFiles.set(uri, { version: 1, languageId, content: text });
}

export async function syncContent(client: LspClient, filePath: string, content: string): Promise<number> {
	const uri = fileToUri(filePath);
	await ensureFileOpen(client, filePath, content);
	const openFile = client.openFiles.get(uri);
	if (!openFile) return 1;
	const version = ++openFile.version;
	openFile.content = content;
	client.diagnostics.delete(uri);
	await sendNotification(client, "textDocument/didChange", {
		textDocument: { uri, version },
		contentChanges: [{ text: content }],
	});
	return version;
}

/** Refresh an already-open document from disk after bash or another process changed it. */
export async function refreshFile(client: LspClient, filePath: string): Promise<void> {
	const uri = fileToUri(filePath);
	if (!client.openFiles.has(uri)) {
		await ensureFileOpen(client, filePath);
		return;
	}
	const content = await readFile(filePath, "utf-8");
	if (client.openFiles.get(uri)?.content === content) return;
	await syncContent(client, filePath, content);
	await notifySaved(client, filePath, content);
}

/** Wait briefly for an announced initial project-indexing pass without penalizing servers that emit no progress. */
export async function waitForProjectReady(client: LspClient, signal?: AbortSignal): Promise<void> {
	const startedAt = Date.now();
	const initialProgressVersion = client.progressVersion;
	let observedProgress = client.activeProgressTokens.size > 0;
	while (Date.now() - startedAt < PROJECT_PROGRESS_TIMEOUT_MS) {
		if (signal?.aborted) {
			throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
		}
		if (client.activeProgressTokens.size > 0 || client.progressVersion !== initialProgressVersion) {
			observedProgress = true;
		}
		if (observedProgress && client.activeProgressTokens.size === 0) return;
		if (!observedProgress && Date.now() - startedAt >= PROJECT_PROGRESS_SETTLE_MS) return;
		await sleep(PROJECT_PROGRESS_POLL_MS, signal);
	}
}

export async function waitForDiagnostics(
	client: LspClient,
	uri: string,
	options: { signal?: AbortSignal; timeoutMs?: number; expectedVersion?: number } = {},
): Promise<LspDiagnostic[]> {
	const timeoutMs = options.timeoutMs ?? 1500;
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		if (options.signal?.aborted) {
			throw options.signal.reason instanceof Error ? options.signal.reason : new Error("Operation aborted");
		}
		const published = client.diagnostics.get(uri);
		if (
			published &&
			(options.expectedVersion === undefined ||
				published.version === null ||
				published.version >= options.expectedVersion)
		) {
			return published.diagnostics;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return [];
}

export async function notifySaved(client: LspClient, filePath: string, content?: string): Promise<void> {
	const uri = fileToUri(filePath);
	if (!client.openFiles.has(uri)) return;
	await sendNotification(client, "textDocument/didSave", {
		textDocument: { uri },
		...(content === undefined ? {} : { text: content }),
	});
}

export async function notifyFileRenamed(client: LspClient, oldPath: string, newPath: string): Promise<void> {
	const oldUri = fileToUri(oldPath);
	const newUri = fileToUri(newPath);
	if (client.openFiles.has(oldUri)) {
		await sendNotification(client, "textDocument/didClose", { textDocument: { uri: oldUri } });
		client.openFiles.delete(oldUri);
		client.diagnostics.delete(oldUri);
	}
	await sendNotification(client, "workspace/didRenameFiles", {
		files: [{ oldUri, newUri }],
	});
}

async function shutdownClientInstance(client: LspClient): Promise<void> {
	const wasStarting = client.state === "starting";
	client.state = "stopped";
	emitClientState(client);
	if (wasStarting) {
		rejectPendingRequests(client, new LspClientShutdownError(client.name));
		client.process.kill();
		return;
	}
	try {
		await sendRequest(client, "shutdown", null, undefined, SHUTDOWN_TIMEOUT_MS);
		await sendNotification(client, "exit", undefined);
	} catch {
		client.process.kill();
	}
	if (client.process.exitCode === null) client.process.kill();
}

export async function shutdownLspClient(key: string): Promise<void> {
	const client = clients.get(key) ?? initializingClients.get(key);
	if (!client) return;
	clients.delete(key);
	initializingClients.delete(key);
	clientLocks.delete(key);
	await shutdownClientInstance(client);
}

export async function shutdownAllLspClients(): Promise<void> {
	const active = [...new Set([...clients.values(), ...initializingClients.values()])];
	clients.clear();
	initializingClients.clear();
	clientLocks.clear();
	await Promise.allSettled(active.map(shutdownClientInstance));
}

export async function shutdownLspClientsForCwd(cwd: string): Promise<void> {
	const resolvedCwd = path.resolve(cwd);
	const active = [...new Set([...clients.values(), ...initializingClients.values()])].filter(
		(client) => path.resolve(client.cwd) === resolvedCwd,
	);
	for (const client of active) {
		clients.delete(client.key);
		initializingClients.delete(client.key);
		clientLocks.delete(client.key);
	}
	await Promise.allSettled(active.map(shutdownClientInstance));
}

export function getActiveLspClients(): LspClient[] {
	return [...clients.values()];
}
