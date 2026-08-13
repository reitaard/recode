import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, watch, writeFileSync } from "node:fs";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { basename, dirname, join } from "node:path";

export interface RecodeSessionControlState {
	active: boolean;
	generating: boolean;
	pid: number;
	sessionId: string;
	sessionFile?: string;
	startedAt: number;
}

interface RecodeSessionControlRecord extends RecodeSessionControlState {
	endpoint: string;
}

type ControlMessage =
	| { type: "state"; state: RecodeSessionControlState }
	| { type: "settled" }
	| { type: "error"; message: string };

function controlKey(sessionId: string): string {
	return createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
}

function controlDirectory(agentDir: string): string {
	return join(agentDir, "runtime");
}

function controlPaths(agentDir: string, sessionId: string): { directory: string; endpoint: string; record: string } {
	const directory = controlDirectory(agentDir);
	const key = controlKey(sessionId);
	return {
		directory,
		endpoint: process.platform === "win32" ? `\\\\.\\pipe\\recode-${key}` : join(directory, `${key}.sock`),
		record: join(directory, `${key}.json`),
	};
}

export function watchRecodeSessionControl(
	agentDir: string,
	sessionId: string,
	onChange: () => void,
): { close(): void } {
	const paths = controlPaths(agentDir, sessionId);
	mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
	const recordName = paths.record.slice(paths.directory.length + 1);
	const watcher = watch(paths.directory, (_event, filename) => {
		if (!filename || filename.toString() === recordName) onChange();
	});
	watcher.on("error", () => undefined);
	return watcher;
}

export function watchRecodeSessionTranscript(sessionFile: string, onChange: () => void): { close(): void } {
	const directory = dirname(sessionFile);
	const sessionName = basename(sessionFile);
	const watcher = watch(directory, (_event, filename) => {
		if (!filename || filename.toString() === sessionName) onChange();
	});
	watcher.on("error", () => undefined);
	return watcher;
}

function send(socket: Socket, message: ControlMessage): void {
	socket.write(`${JSON.stringify(message)}\n`);
}

export class RecodeSessionControlHost {
	private readonly agentDir: string;
	private readonly sessionId: string;
	private readonly sessionFile: string | undefined;
	private readonly abortOperation: () => Promise<unknown>;
	private readonly sockets = new Set<Socket>();
	private server: Server | undefined;
	private state: RecodeSessionControlState | undefined;

	constructor(
		agentDir: string,
		sessionId: string,
		sessionFile: string | undefined,
		abortOperation: () => Promise<unknown>,
	) {
		this.agentDir = agentDir;
		this.sessionId = sessionId;
		this.sessionFile = sessionFile;
		this.abortOperation = abortOperation;
	}

	async start(): Promise<void> {
		if (this.server) return;
		const paths = controlPaths(this.agentDir, this.sessionId);
		mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
		if (existsSync(paths.record)) {
			try {
				const owner = JSON.parse(readFileSync(paths.record, "utf8")) as RecodeSessionControlRecord;
				process.kill(owner.pid, 0);
				if (owner.pid !== process.pid)
					throw new Error(`Session ${this.sessionId} is active in process ${owner.pid}`);
			} catch (error) {
				if (error instanceof Error && error.message.startsWith("Session ")) throw error;
				rmSync(paths.record, { force: true });
			}
		}
		if (process.platform !== "win32") rmSync(paths.endpoint, { force: true });
		this.state = {
			active: true,
			generating: false,
			pid: process.pid,
			sessionId: this.sessionId,
			sessionFile: this.sessionFile,
			startedAt: Date.now(),
		};
		this.server = createServer((socket) => this.accept(socket));
		await new Promise<void>((resolve, reject) => {
			this.server?.once("error", reject);
			this.server?.listen(paths.endpoint, () => {
				this.server?.off("error", reject);
				resolve();
			});
		});
		const record: RecodeSessionControlRecord = { ...this.state, endpoint: paths.endpoint };
		const temporary = `${paths.record}.${process.pid}.tmp`;
		writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
		renameSync(temporary, paths.record);
	}

	setGenerating(): void {
		if (!this.state || this.state.generating) return;
		this.state = { ...this.state, generating: true };
		this.broadcast({ type: "state", state: this.state });
	}

	async stop(): Promise<void> {
		if (!this.server) return;
		const paths = controlPaths(this.agentDir, this.sessionId);
		this.broadcast({ type: "settled" });
		for (const socket of this.sockets) socket.end();
		this.sockets.clear();
		const server = this.server;
		this.server = undefined;
		this.state = undefined;
		await new Promise<void>((resolve) => server.close(() => resolve()));
		let owned = false;
		try {
			const record = JSON.parse(readFileSync(paths.record, "utf8")) as RecodeSessionControlRecord;
			owned = record.pid === process.pid;
		} catch {}
		if (owned) rmSync(paths.record, { force: true });
		if (process.platform !== "win32") rmSync(paths.endpoint, { force: true });
	}

	private accept(socket: Socket): void {
		this.sockets.add(socket);
		if (this.state) send(socket, { type: "state", state: this.state });
		let input = "";
		socket.on("data", (chunk) => {
			input += chunk.toString("utf8");
			for (;;) {
				const newline = input.indexOf("\n");
				if (newline < 0) break;
				const line = input.slice(0, newline);
				input = input.slice(newline + 1);
				if (line === "abort") {
					void this.abortOperation().catch((error: unknown) =>
						send(socket, { type: "error", message: error instanceof Error ? error.message : String(error) }),
					);
				}
			}
		});
		socket.on("close", () => this.sockets.delete(socket));
		socket.on("error", () => this.sockets.delete(socket));
	}

	private broadcast(message: ControlMessage): void {
		for (const socket of this.sockets) send(socket, message);
	}
}

export class RecodeSessionControlClient {
	private readonly record: RecodeSessionControlRecord;
	private readonly onMessage: (message: ControlMessage) => void;
	private socket: Socket | undefined;
	private input = "";
	private settled = false;

	private constructor(record: RecodeSessionControlRecord, onMessage: (message: ControlMessage) => void) {
		this.record = record;
		this.onMessage = onMessage;
	}

	static async connect(
		agentDir: string,
		sessionId: string,
		onMessage: (message: ControlMessage) => void,
	): Promise<RecodeSessionControlClient | undefined> {
		const paths = controlPaths(agentDir, sessionId);
		if (!existsSync(paths.record)) return undefined;
		let record: RecodeSessionControlRecord;
		try {
			record = JSON.parse(readFileSync(paths.record, "utf8")) as RecodeSessionControlRecord;
			process.kill(record.pid, 0);
			if (record.pid === process.pid) return undefined;
		} catch {
			rmSync(paths.record, { force: true });
			return undefined;
		}
		const client = new RecodeSessionControlClient(record, onMessage);
		try {
			await client.open();
			return client;
		} catch {
			client.close();
			return undefined;
		}
	}

	get state(): RecodeSessionControlState {
		return this.record;
	}

	abort(): void {
		this.socket?.write("abort\n");
	}

	close(): void {
		this.socket?.destroy();
		this.socket = undefined;
	}

	private async open(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const socket = createConnection(this.record.endpoint);
			this.socket = socket;
			socket.once("connect", resolve);
			socket.once("error", reject);
			socket.on("data", (chunk) => this.handleData(chunk.toString("utf8")));
			socket.on("close", () => {
				if (!this.settled) this.onMessage({ type: "settled" });
			});
		});
	}

	private handleData(chunk: string): void {
		this.input += chunk;
		for (;;) {
			const newline = this.input.indexOf("\n");
			if (newline < 0) return;
			const line = this.input.slice(0, newline);
			this.input = this.input.slice(newline + 1);
			try {
				const message = JSON.parse(line) as ControlMessage;
				if (message.type === "settled") this.settled = true;
				this.onMessage(message);
			} catch {}
		}
	}
}
