import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { getServiceOwnerPath, getServiceRestartHistoryPath, getSocketPath } from "../src/config.ts";
import { sendIpcRequest } from "../src/ipc/client.ts";
import type { OrchestratorRequest, OrchestratorResponse } from "../src/ipc/protocol.ts";
import { closeIpcServer, type IpcRequestHandler, startIpcServer } from "../src/ipc/server.ts";
import {
	createSystemdUnit,
	createWindowsJobHost,
	createWindowsTaskXml,
	NativeServiceManager,
	summarizeServiceRuntime,
} from "../src/native-service.ts";
import { acquireServiceOwnership } from "../src/service-ownership.ts";
import type { MaestroServiceHealth, MaestroServiceOwnerReceipt, ProcessIdentityRecord } from "../src/types.ts";

const temporaryDirectories: string[] = [];
const originalOrchestratorDir = process.env.PI_ORCHESTRATOR_DIR;

afterEach(() => {
	if (originalOrchestratorDir === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
	else process.env.PI_ORCHESTRATOR_DIR = originalOrchestratorDir;
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function useTemporaryServiceDir(): string {
	const directory = mkdtempSync(join(tmpdir(), "recode-maestro-service-"));
	temporaryDirectories.push(directory);
	process.env.PI_ORCHESTRATOR_DIR = directory;
	return directory;
}

function currentIdentity(): ProcessIdentityRecord {
	return { pid: process.pid, startReceipt: "a".repeat(64) };
}

describe("Maestro native service supervision", () => {
	test("enforces one verified owner and classifies a stale verified owner as a crash", () => {
		useTemporaryServiceDir();
		const inspect = (pid: number): ProcessIdentityRecord | undefined =>
			pid === process.pid ? currentIdentity() : undefined;
		const first = acquireServiceOwnership({ supervisionMode: "manual", inspectProcessIdentity: inspect });
		assert.throws(
			() => acquireServiceOwnership({ supervisionMode: "manual", inspectProcessIdentity: inspect }),
			/already owned/,
		);
		first.release();

		const staleOwner: MaestroServiceOwnerReceipt = {
			schemaVersion: 1,
			serviceId: "stale-owner",
			processIdentity: { pid: 999_999, startReceipt: "b".repeat(64) },
			startedAt: new Date().toISOString(),
			supervisionMode: "systemd",
			endpoint: getSocketPath(),
		};
		writeFileSync(getServiceOwnerPath(), `${JSON.stringify(staleOwner)}\n`, { encoding: "utf8", mode: 0o600 });
		const replacement = acquireServiceOwnership({ supervisionMode: "manual", inspectProcessIdentity: inspect });
		assert.equal(replacement.restartDiagnostics.at(-1)?.classification, "process-crash");
		assert.match(readFileSync(getServiceRestartHistoryPath(), "utf8"), /process-crash/);
		replacement.release();
	});

	test("generates Linux cgroup containment and Windows kill-on-close containment", () => {
		const unit = createSystemdUnit("/usr/bin/node", "/opt/recode/cli.js");
		assert.match(unit, /Restart=on-failure/);
		assert.match(unit, /KillMode=control-group/);
		assert.match(unit, /--supervision systemd/);
		assert.doesNotMatch(unit, /watcher/i);

		const host = createWindowsJobHost("C:\\Program Files\\nodejs\\node.exe", "C:\\Recode App\\cli.js");
		assert.match(host, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
		assert.match(host, /AssignProcessToJobObject/);
		assert.match(host, /CreateNoWindow = true/);
		assert.match(host, /WindowStyle = ProcessWindowStyle\.Hidden/);
		assert.match(host, /windows-task/);
		const xml = createWindowsTaskXml("C:\\Recode App\\maestro.ps1", "domain\\creator");
		assert.match(xml, /<RestartOnFailure>/);
		assert.match(xml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
		assert.match(xml, /<AllowHardTerminate>true<\/AllowHardTerminate>/);
		assert.match(xml, /-WindowStyle Hidden/);
	});

	test("distinguishes a running, stopped, and unexpectedly exited runtime", () => {
		const health: MaestroServiceHealth = {
			schemaVersion: 1,
			serviceId: "service",
			state: "ready",
			ready: true,
			acceptingRequests: true,
			supervisionMode: "windows-task",
			processIdentity: { pid: 123, startReceipt: "a".repeat(64) },
			startedAt: "2026-07-30T00:00:00.000Z",
			updatedAt: "2026-07-30T00:00:01.000Z",
			endpoint: "maestro-test",
			liveInstances: 0,
			waitingInput: 0,
			adapters: { radius: "disabled" },
			restartLoopDetected: false,
			restartDiagnostics: [],
		};
		assert.equal(summarizeServiceRuntime(health, true), "Maestro runtime: running (PID 123)");
		assert.equal(
			summarizeServiceRuntime(
				{ ...health, state: "stopped", ready: false, lastExitClassification: "planned-stop" },
				false,
			),
			"Maestro runtime: stopped (planned-stop)",
		);
		assert.equal(
			summarizeServiceRuntime({ ...health, state: "ready", ready: true }, false),
			"Maestro runtime: exited unexpectedly (last persisted state: ready)",
		);
	});

	test("does not report native service start success before Maestro is ready", async () => {
		useTemporaryServiceDir();
		const commands: string[] = [];
		let readyChecks = 0;
		const manager = new NativeServiceManager({
			platform: "win32",
			runCommand: (command, args) => {
				commands.push(`${command} ${args.join(" ")}`);
				return "task launched";
			},
			waitUntilReady: async () => {
				readyChecks++;
			},
		});
		assert.equal(await manager.execute("start"), "task launched");
		assert.equal(readyChecks, 1);
		assert.deepEqual(commands, ["schtasks.exe /Run /TN Recode Maestro"]);

		commands.length = 0;
		const installManager = new NativeServiceManager({
			platform: "win32",
			execPath: "C:\\node.exe",
			cliPath: "C:\\recode\\cli.js",
			runCommand: (command, args) => {
				commands.push(`${command} ${args.join(" ")}`);
				return command === "whoami.exe" ? "host\\creator" : "task changed";
			},
			waitUntilReady: async () => {
				readyChecks++;
			},
		});
		assert.equal(await installManager.execute("install"), "task changed");
		assert.deepEqual(commands, [
			"schtasks.exe /End /TN Recode Maestro",
			"whoami.exe ",
			`schtasks.exe /Create /TN Recode Maestro /XML ${join(process.env.PI_ORCHESTRATOR_DIR ?? "", "recode-maestro-task.xml")} /F`,
			"schtasks.exe /Run /TN Recode Maestro",
		]);
		assert.equal(readyChecks, 2);

		const failingManager = new NativeServiceManager({
			platform: "linux",
			runCommand: () => "unit launched",
			waitUntilReady: async () => {
				throw new Error("readiness deadline expired");
			},
		});
		await assert.rejects(failingManager.execute("start"), /readiness deadline expired/);
	});

	test("serves ready health and completes a classified planned shutdown", { timeout: 20_000 }, async () => {
		const directory = useTemporaryServiceDir();
		const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
		const child = spawn(
			process.execPath,
			["--experimental-strip-types", cliPath, "service", "run", "--supervision", "manual"],
			{
				env: { ...process.env, PI_CONFIG_DIR: directory, PI_ORCHESTRATOR_DIR: directory },
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			},
		);
		let output = "";
		child.stdout.on("data", (chunk: Buffer | string) => {
			output += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer | string) => {
			output += chunk.toString();
		});
		const exit = new Promise<number>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code) => resolve(code ?? 1));
		});
		try {
			const readyDeadline = Date.now() + 15_000;
			while (!output.includes("Maestro listening") && Date.now() < readyDeadline) {
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			assert.match(output, /Maestro listening/);
			const health = await sendIpcRequest({ type: "health" }, { timeoutMs: 2_000 });
			assert.equal(health.type, "health_result");
			assert.equal(health.health?.ready, true);
			const shutdown = await sendIpcRequest({ type: "shutdown", reason: "planned-stop" }, { timeoutMs: 2_000 });
			assert.deepEqual(shutdown, { type: "shutdown_result", ok: true, reason: "planned-stop" });
			assert.equal(await exit, 0);
			assert.equal(existsSync(getServiceOwnerPath()), false);
			const persistedHealth = JSON.parse(readFileSync(join(directory, "service-health.json"), "utf8")) as {
				state?: string;
				lastExitClassification?: string;
			};
			assert.equal(persistedHealth.state, "stopped");
			assert.equal(persistedHealth.lastExitClassification, "planned-stop");
		} finally {
			if (child.exitCode === null) child.kill("SIGKILL");
		}
	});

	test("closes active attachment sockets during bounded service shutdown", async () => {
		useTemporaryServiceDir();
		const requestHandler = (async (_request: OrchestratorRequest): Promise<OrchestratorResponse> => ({
			type: "list_result",
			ok: true,
			instances: [],
		})) as IpcRequestHandler;
		const server = await startIpcServer(requestHandler);
		const socket = createConnection(getSocketPath());
		await new Promise<void>((resolve, reject) => {
			socket.once("connect", resolve);
			socket.once("error", reject);
		});
		const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
		await closeIpcServer(server);
		await closed;
		assert.equal(socket.destroyed, true);
	});
});
