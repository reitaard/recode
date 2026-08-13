/**
 * Automatic lspmux integration adapted from can1357/oh-my-pi (MIT).
 * It intentionally mirrors upstream's conservative default: rust-analyzer only.
 */

import { type ExecFileException, execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LspmuxState, LspmuxWrappedCommand } from "./types.ts";
import { commandBasename } from "./utils.ts";

const execFileAsync = promisify(execFile);
const DEFAULT_SUPPORTED_SERVERS = new Set(["rust-analyzer"]);
const STATE_CACHE_TTL_MS = 5 * 60 * 1000;
const LIVENESS_TIMEOUT_MS = 1000;

let cachedState: LspmuxState | undefined;
let cacheTimestamp = 0;

async function findExecutable(command: string): Promise<string | null> {
	const lookup = process.platform === "win32" ? "where.exe" : "which";
	try {
		const { stdout } = await execFileAsync(lookup, [command], { windowsHide: true });
		return (
			stdout
				.split(/\r?\n/)
				.map((line) => line.trim())
				.find(Boolean) ?? null
		);
	} catch {
		return null;
	}
}

async function checkServerRunning(binaryPath: string): Promise<boolean> {
	try {
		await execFileAsync(binaryPath, ["status"], { timeout: LIVENESS_TIMEOUT_MS, windowsHide: true });
		return true;
	} catch (error) {
		const execError = error as ExecFileException & { killed?: boolean };
		return !execError.killed && execError.code === 0;
	}
}

export function clearLspmuxDetectionCache(): void {
	cachedState = undefined;
	cacheTimestamp = 0;
}

export async function detectLspmux(): Promise<LspmuxState> {
	const now = Date.now();
	if (cachedState && now - cacheTimestamp < STATE_CACHE_TTL_MS) return cachedState;
	if (process.env.PI_DISABLE_LSPMUX === "1") {
		cachedState = { available: false, running: false, binaryPath: null };
		cacheTimestamp = now;
		return cachedState;
	}
	const binaryPath = await findExecutable("lspmux");
	const running = binaryPath ? await checkServerRunning(binaryPath) : false;
	cachedState = { available: binaryPath !== null, running, binaryPath };
	cacheTimestamp = now;
	return cachedState;
}

export function isLspmuxSupported(command: string): boolean {
	return DEFAULT_SUPPORTED_SERVERS.has(commandBasename(command));
}

export function wrapWithLspmux(
	originalCommand: string,
	originalArgs: string[] | undefined,
	state: LspmuxState,
): LspmuxWrappedCommand {
	if (!state.available || !state.running || !state.binaryPath || !isLspmuxSupported(originalCommand)) {
		return { command: originalCommand, args: originalArgs ?? [] };
	}
	const baseName = commandBasename(originalCommand);
	const args = originalArgs ?? [];
	if (baseName === "rust-analyzer" && originalCommand === "rust-analyzer" && args.length === 0) {
		return { command: state.binaryPath, args: [] };
	}
	return {
		command: state.binaryPath,
		args: args.length > 0 ? ["client", "--", ...args] : ["client"],
		env: { LSPMUX_SERVER: originalCommand },
	};
}

export async function getLspmuxCommand(command: string, args?: string[]): Promise<LspmuxWrappedCommand> {
	return wrapWithLspmux(command, args, await detectLspmux());
}
