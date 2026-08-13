import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const AVAILABLE_REFRESH_MS = 2_000;
const UNAVAILABLE_REFRESH_MS = 30_000;
const HEALTH_TIMEOUT_MS = 500;
const MAX_RESPONSE_BYTES = 65_536;

export interface MaestroHealthSnapshot {
	state: "starting" | "ready" | "degraded" | "draining" | "stopped" | "crashed";
	ready: boolean;
	liveInstances: number;
	waitingInput: number;
	restartLoopDetected: boolean;
	diagnostic?: string;
}

function getMaestroBaseDir(): string {
	return process.env.PI_ORCHESTRATOR_DIR ?? join(process.env.PI_CONFIG_DIR ?? join(homedir(), ".pi"), "orchestrator");
}

function getMaestroEndpoint(): string {
	const baseDir = getMaestroBaseDir();
	if (process.platform === "win32") {
		const identity = createHash("sha256").update(resolve(baseDir).toLowerCase()).digest("hex").slice(0, 24);
		return `\\\\.\\pipe\\recode-maestro-${identity}`;
	}
	return join(baseDir, "maestro.sock");
}

function parseHealth(line: string): MaestroHealthSnapshot | undefined {
	const parsed = JSON.parse(line) as unknown;
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const response = parsed as Record<string, unknown>;
	if (
		response.type !== "health_result" ||
		response.ok !== true ||
		typeof response.health !== "object" ||
		!response.health
	) {
		return undefined;
	}
	const health = response.health as Record<string, unknown>;
	if (
		(health.state !== "starting" &&
			health.state !== "ready" &&
			health.state !== "degraded" &&
			health.state !== "draining" &&
			health.state !== "stopped" &&
			health.state !== "crashed") ||
		typeof health.ready !== "boolean" ||
		typeof health.liveInstances !== "number" ||
		!Number.isSafeInteger(health.liveInstances) ||
		typeof health.waitingInput !== "number" ||
		!Number.isSafeInteger(health.waitingInput) ||
		typeof health.restartLoopDetected !== "boolean"
	) {
		return undefined;
	}
	if (health.diagnostic !== undefined && typeof health.diagnostic !== "string") return undefined;
	return health as unknown as MaestroHealthSnapshot;
}

function readMaestroAuthToken(): string | undefined {
	try {
		const parsed = JSON.parse(readFileSync(join(getMaestroBaseDir(), "ipc-auth.json"), "utf8")) as {
			token?: unknown;
		};
		return typeof parsed.token === "string" ? parsed.token : undefined;
	} catch {
		return undefined;
	}
}

export async function queryMaestroHealth(timeoutMs = HEALTH_TIMEOUT_MS): Promise<MaestroHealthSnapshot | undefined> {
	return await new Promise<MaestroHealthSnapshot | undefined>((resolvePromise) => {
		const socket = createConnection(getMaestroEndpoint());
		let buffer = "";
		let settled = false;
		const finish = (health?: MaestroHealthSnapshot): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.removeAllListeners();
			socket.destroy();
			resolvePromise(health);
		};
		const timer = setTimeout(() => finish(), timeoutMs);
		timer.unref();
		socket.once("connect", () => {
			const authToken = readMaestroAuthToken();
			socket.write(`${JSON.stringify({ type: "health", ...(authToken ? { authToken } : {}) })}\n`);
		});
		socket.on("data", (chunk: Buffer | string) => {
			buffer += chunk.toString();
			if (Buffer.byteLength(buffer) > MAX_RESPONSE_BYTES) {
				finish();
				return;
			}
			const newlineIndex = buffer.indexOf("\n");
			if (newlineIndex === -1) return;
			try {
				finish(parseHealth(buffer.slice(0, newlineIndex)));
			} catch {
				finish();
			}
		});
		socket.once("error", () => finish());
		socket.once("end", () => finish());
	});
}

function formatStatus(health: MaestroHealthSnapshot): string {
	const warning = health.state === "degraded" || health.restartLoopDetected ? " degraded" : "";
	const waiting = health.waitingInput > 0 ? ` / ${health.waitingInput} input` : "";
	return `MAESTRO ◆ ${health.liveInstances} live${waiting}${warning}`;
}

export class MaestroStatusMonitor {
	private readonly onStatus: (status: string | undefined) => void;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private stopped = false;
	private lastStatus: string | undefined;

	constructor(onStatus: (status: string | undefined) => void) {
		this.onStatus = onStatus;
	}

	start(): void {
		if (this.stopped) return;
		void this.refresh();
	}

	stop(): void {
		this.stopped = true;
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		if (this.lastStatus !== undefined) this.onStatus(undefined);
		this.lastStatus = undefined;
	}

	private async refresh(): Promise<void> {
		const health = await queryMaestroHealth();
		if (this.stopped) return;
		const status = health?.ready ? formatStatus(health) : undefined;
		if (status !== this.lastStatus) {
			this.lastStatus = status;
			this.onStatus(status);
		}
		this.timer = setTimeout(() => void this.refresh(), health ? AVAILABLE_REFRESH_MS : UNAVAILABLE_REFRESH_MS);
		this.timer.unref();
	}
}
