import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	AgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
} from "@reitaard/recode-coding-agent";
import { createMaestroChildEnvironment } from "./child-environment.ts";
import { isBunBinary } from "./config.ts";
import { inspectLocalProcessIdentity } from "./process-identity.ts";
import type { ProcessIdentityRecord } from "./types.ts";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_GRACEFUL_SHUTDOWN_MS = 3_000;
const DEFAULT_FORCE_KILL_WAIT_MS = 2_000;
const DEFAULT_MAX_PENDING_REQUESTS = 64;
const MAX_REQUEST_IDS_PER_PROCESS = 100_000;
const MAX_CONCURRENT_PROMPTS = 1;
const MAX_STDOUT_BUFFER_CHARS = 1_048_576;
const MAX_STDERR_BUFFER_CHARS = 32_768;
const CANCELLABLE_COMMANDS: ReadonlySet<RpcCommand["type"]> = new Set(["prompt"]);

interface PendingRequest {
	command: RpcCommand["type"];
	resolve(response: RpcResponse): void;
	reject(error: Error): void;
	cleanup(): void;
}

export interface RpcProcessOptions {
	cwd: string;
	workspaceAccess?: "read-only" | "write";
	requestTimeoutMs?: number;
	gracefulShutdownMs?: number;
	forceKillWaitMs?: number;
	maxPendingRequests?: number;
}

export interface RpcSendOptions {
	timeoutMs?: number;
	signal?: AbortSignal;
}

export interface RpcCancellationResult {
	commandId: string;
	requested: boolean;
	accepted: boolean;
	completed: boolean;
	alreadyTerminal?: boolean;
	unsupported: boolean;
	unknown: boolean;
}

export interface RpcDisposeResult {
	graceful: boolean;
	forced: boolean;
	exited: boolean;
}

export class RpcRequestTimeoutError extends Error {
	readonly commandId: string;
	readonly timeoutMs: number;

	constructor(commandId: string, timeoutMs: number) {
		super(`RPC request ${commandId} timed out after ${timeoutMs}ms`);
		this.name = "RpcRequestTimeoutError";
		this.commandId = commandId;
		this.timeoutMs = timeoutMs;
	}
}

export class RpcRequestCancelledError extends Error {
	readonly commandId: string;

	constructor(commandId: string) {
		super(`RPC request ${commandId} was cancelled`);
		this.name = "RpcRequestCancelledError";
		this.commandId = commandId;
	}
}

type RpcProcessSpawner = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function boundedPositive(value: number | undefined, fallback: number, name: string): number {
	const resolved = value ?? fallback;
	if (!Number.isFinite(resolved) || resolved < 0) throw new Error(`${name} must be a non-negative finite number`);
	return resolved;
}

export class RpcProcessInstance {
	readonly process: ChildProcess;
	private cachedProcessIdentity?: ProcessIdentityRecord;

	private exited = false;
	private disposing = false;
	private nextRequestId = 0;
	private stdoutBuffer = "";
	private stderrBuffer = "";
	private readonly requestTimeoutMs: number;
	private readonly gracefulShutdownMs: number;
	private readonly forceKillWaitMs: number;
	private readonly maxPendingRequests: number;
	private readonly pendingRequests = new Map<string, PendingRequest>();
	private readonly usedRequestIds = new Set<string>();
	private readonly eventListeners = new Set<(event: AgentSessionEvent) => void>();
	private readonly exitListeners = new Set<(error?: Error) => void>();
	private uiRequestHandler: ((request: RpcExtensionUIRequest) => void) | undefined;

	constructor(
		options: RpcProcessOptions,
		spawnProcess: RpcProcessSpawner = spawn,
		rpcCommand: { command: string; args: string[] } = this.getSpawnCommand(),
	) {
		this.requestTimeoutMs = boundedPositive(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, "requestTimeoutMs");
		this.gracefulShutdownMs = boundedPositive(
			options.gracefulShutdownMs,
			DEFAULT_GRACEFUL_SHUTDOWN_MS,
			"gracefulShutdownMs",
		);
		this.forceKillWaitMs = boundedPositive(options.forceKillWaitMs, DEFAULT_FORCE_KILL_WAIT_MS, "forceKillWaitMs");
		this.maxPendingRequests = boundedPositive(
			options.maxPendingRequests,
			DEFAULT_MAX_PENDING_REQUESTS,
			"maxPendingRequests",
		);
		if (!Number.isSafeInteger(this.maxPendingRequests) || this.maxPendingRequests < 1) {
			throw new Error("maxPendingRequests must be a positive safe integer");
		}
		const rpcArgs = options.workspaceAccess === "read-only" ? [...rpcCommand.args, "--no-tools"] : rpcCommand.args;
		this.process = spawnProcess(rpcCommand.command, rpcArgs, {
			cwd: options.cwd,
			env: createMaestroChildEnvironment(process.env, options.workspaceAccess ?? "write"),
			stdio: ["pipe", "pipe", "pipe"],
		});
		if (!this.process.stdin || !this.process.stdout) throw new Error("Failed to create RPC process stdio");
		this.attachListeners();
	}

	get processIdentity(): ProcessIdentityRecord | undefined {
		if (this.cachedProcessIdentity) return { ...this.cachedProcessIdentity };
		const pid = this.process.pid;
		if (!pid) return undefined;
		this.cachedProcessIdentity = inspectLocalProcessIdentity(pid);
		return this.cachedProcessIdentity ? { ...this.cachedProcessIdentity } : undefined;
	}

	private getSpawnCommand(): { command: string; args: string[] } {
		if (isBunBinary) {
			return {
				command: join(dirname(process.execPath), process.platform === "win32" ? "recode.exe" : "recode"),
				args: ["--mode", "rpc"],
			};
		}
		return {
			command: process.execPath,
			args: [fileURLToPath(import.meta.resolve("@reitaard/recode-coding-agent/rpc-entry"))],
		};
	}

	private attachListeners(): void {
		this.process.stdout?.setEncoding("utf8");
		this.process.stdout?.on("data", (chunk: string) => {
			this.stdoutBuffer += chunk;
			if (this.stdoutBuffer.length > MAX_STDOUT_BUFFER_CHARS) {
				this.failProtocol(new Error("RPC stdout line exceeded the 1 MiB protocol bound"));
				return;
			}
			while (true) {
				const newlineIndex = this.stdoutBuffer.indexOf("\n");
				if (newlineIndex === -1) break;
				const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
				this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
				if (!line) continue;
				try {
					this.handleLine(line);
				} catch (error) {
					this.failProtocol(new Error(`Invalid RPC output: ${toError(error).message}`));
					return;
				}
			}
		});

		this.process.stderr?.setEncoding("utf8");
		this.process.stderr?.on("data", (chunk: string) => {
			this.stderrBuffer = `${this.stderrBuffer}${chunk}`.slice(-MAX_STDERR_BUFFER_CHARS);
		});

		this.process.once("error", (error) => {
			this.markExited(new Error(`RPC process error: ${error.message}.${this.stderrDiagnostic()}`));
		});
		this.process.once("exit", (code, signal) => {
			this.markExited(new Error(`RPC process exited (code=${code} signal=${signal}).${this.stderrDiagnostic()}`));
		});
	}

	private stderrDiagnostic(): string {
		if (!this.stderrBuffer) return "";
		const bytes = Buffer.byteLength(this.stderrBuffer);
		const digest = createHash("sha256").update(this.stderrBuffer).digest("hex").slice(0, 16);
		return ` Child stderr captured (${bytes} bytes, sha256=${digest})`;
	}

	private failProtocol(error: Error): void {
		this.rejectAllPending(error);
		if (!this.exited) this.process.kill("SIGKILL");
	}

	private markExited(error: Error): void {
		if (this.exited) return;
		this.exited = true;
		this.rejectAllPending(error);
		this.notifyExit(this.disposing ? undefined : error);
	}

	private handleLine(line: string): void {
		const parsed = JSON.parse(line) as { type?: string; id?: string };
		switch (parsed.type) {
			case "response": {
				if (!parsed.id) return;
				const pending = this.pendingRequests.get(parsed.id);
				if (!pending) return;
				this.pendingRequests.delete(parsed.id);
				pending.cleanup();
				pending.resolve(parsed as RpcResponse);
				return;
			}
			case "extension_ui_request": {
				try {
					this.uiRequestHandler?.(parsed as RpcExtensionUIRequest);
				} catch {
					// UI observers cannot enter RPC protocol control flow.
				}
				return;
			}
			default: {
				for (const listener of this.eventListeners) {
					try {
						listener(parsed as AgentSessionEvent);
					} catch {
						// Event observers are isolated from the child process transport.
					}
				}
			}
		}
	}

	private rejectAllPending(error: Error): void {
		for (const [id, pending] of this.pendingRequests) {
			this.pendingRequests.delete(id);
			pending.cleanup();
			pending.reject(error);
		}
	}

	private notifyExit(error?: Error): void {
		for (const listener of this.exitListeners) listener(error);
	}

	private writeBestEffort(data: string): void {
		const stdin = this.process.stdin;
		if (!stdin || stdin.destroyed || this.exited || this.disposing) return;
		try {
			stdin.write(data, () => undefined);
		} catch {
			// The child may exit between the state check and the write.
		}
	}

	private requestBestEffortAbort(command: RpcCommand["type"], commandId: string): void {
		if (!CANCELLABLE_COMMANDS.has(command) || this.exited || this.disposing) return;
		const id = `orchestrator_abort_${commandId}_${randomUUID()}`;
		this.writeBestEffort(`${JSON.stringify({ id, type: "abort" })}\n`);
	}

	send(command: RpcCommand, options: RpcSendOptions = {}): Promise<RpcResponse> {
		if (this.exited || this.disposing) throw new Error(`RPC process is not running.${this.stderrDiagnostic()}`);
		if (this.pendingRequests.size >= this.maxPendingRequests) throw new Error("RPC pending request limit reached");
		if (
			command.type === "prompt" &&
			[...this.pendingRequests.values()].filter((pending) => pending.command === "prompt").length >=
				MAX_CONCURRENT_PROMPTS
		) {
			throw new Error("RPC concurrent prompt limit reached");
		}
		if (this.usedRequestIds.size >= MAX_REQUEST_IDS_PER_PROCESS)
			throw new Error("RPC request identity limit reached");
		const id = command.id ?? `orchestrator_${++this.nextRequestId}_${randomUUID()}`;
		if (!id || id.length > 512) throw new Error("RPC request id must contain 1 to 512 characters");
		if (this.usedRequestIds.has(id)) throw new Error(`Duplicate or stale RPC request id: ${id}`);
		this.usedRequestIds.add(id);
		const timeoutMs = boundedPositive(options.timeoutMs, this.requestTimeoutMs, "timeoutMs");
		const fullCommand = { ...command, id };
		return new Promise<RpcResponse>((resolve, reject) => {
			let timer: NodeJS.Timeout | undefined;
			const onAbort = (): void => {
				const pending = this.pendingRequests.get(id);
				if (!pending) return;
				this.pendingRequests.delete(id);
				pending.cleanup();
				this.requestBestEffortAbort(pending.command, id);
				reject(new RpcRequestCancelledError(id));
			};
			const cleanup = (): void => {
				if (timer) clearTimeout(timer);
				options.signal?.removeEventListener("abort", onAbort);
			};
			this.pendingRequests.set(id, { command: command.type, resolve, reject, cleanup });
			if (options.signal?.aborted) {
				onAbort();
				return;
			}
			options.signal?.addEventListener("abort", onAbort, { once: true });
			timer = setTimeout(() => {
				const pending = this.pendingRequests.get(id);
				if (!pending) return;
				this.pendingRequests.delete(id);
				pending.cleanup();
				this.requestBestEffortAbort(pending.command, id);
				reject(new RpcRequestTimeoutError(id, timeoutMs));
			}, timeoutMs);
			timer.unref();
			this.process.stdin?.write(`${JSON.stringify(fullCommand)}\n`, (error) => {
				if (!error) return;
				const pending = this.pendingRequests.get(id);
				if (!pending) return;
				this.pendingRequests.delete(id);
				pending.cleanup();
				reject(toError(error));
			});
		});
	}

	async cancel(commandId: string): Promise<RpcCancellationResult> {
		if (!commandId || commandId.length > 512) throw new Error("commandId must contain 1 to 512 characters");
		const pending = this.pendingRequests.get(commandId);
		if (!pending) {
			return { commandId, requested: false, accepted: false, completed: false, unsupported: false, unknown: true };
		}
		if (!CANCELLABLE_COMMANDS.has(pending.command)) {
			return { commandId, requested: false, accepted: false, completed: false, unsupported: true, unknown: false };
		}
		try {
			const response = await this.send({ type: "abort" });
			const completed = response.success === true && response.command === "abort";
			return { commandId, requested: true, accepted: completed, completed, unsupported: false, unknown: false };
		} catch {
			return { commandId, requested: true, accepted: false, completed: false, unsupported: false, unknown: false };
		}
	}

	handleUiResponse(response: RpcExtensionUIResponse): void {
		this.writeBestEffort(`${JSON.stringify(response)}\n`);
	}

	setUiRequestHandler(handler?: (request: RpcExtensionUIRequest) => void): void {
		this.uiRequestHandler = handler;
	}

	onEvent(listener: (event: AgentSessionEvent) => void): () => void {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	}

	onExit(listener: (error?: Error) => void): () => void {
		this.exitListeners.add(listener);
		return () => this.exitListeners.delete(listener);
	}

	async dispose(): Promise<RpcDisposeResult> {
		this.uiRequestHandler = undefined;
		this.disposing = true;
		this.rejectAllPending(new Error("RPC process disposed"));
		if (this.exited) return { graceful: false, forced: false, exited: true };
		const gracefulExit = this.waitForExit(this.gracefulShutdownMs);
		this.process.kill("SIGTERM");
		if (await gracefulExit) return { graceful: true, forced: false, exited: true };
		const forcedExit = this.waitForExit(this.forceKillWaitMs);
		this.process.kill("SIGKILL");
		return { graceful: false, forced: true, exited: await forcedExit };
	}

	private async waitForExit(timeoutMs: number): Promise<boolean> {
		if (this.exited) return true;
		return await new Promise<boolean>((resolve) => {
			const onExit = (): void => {
				clearTimeout(timer);
				resolve(true);
			};
			const timer = setTimeout(() => {
				this.process.removeListener("exit", onExit);
				resolve(this.exited);
			}, timeoutMs);
			timer.unref();
			this.process.once("exit", onExit);
		});
	}
}

export function createRpcProcessInstance(options: RpcProcessOptions): RpcProcessInstance {
	return new RpcProcessInstance(options);
}
