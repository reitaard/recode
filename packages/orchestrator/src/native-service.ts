import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getOrchestratorDir, getServiceOwnerPath, isBunBinary } from "./config.ts";
import { sendIpcRequest } from "./ipc/client.ts";
import { inspectLocalProcessIdentity, verifyProcessIdentity } from "./process-identity.ts";
import { readPersistedServiceHealth } from "./service-ownership.ts";
import type { MaestroServiceHealth } from "./types.ts";

const WINDOWS_TASK_NAME = "Recode Maestro";
const LINUX_UNIT_NAME = "recode-maestro.service";
const COMMAND_TIMEOUT_MS = 15_000;
const SERVICE_READY_TIMEOUT_MS = 60_000;
const SERVICE_READY_POLL_MS = 100;

export type NativeServicePlatform = "linux" | "win32";
export type NativeServiceAction = "install" | "uninstall" | "start" | "stop" | "restart" | "status";

export type NativeCommandRunner = (command: string, args: string[]) => string;
export type NativeServiceReadyWaiter = () => Promise<void>;

function defaultCommandRunner(command: string, args: string[]): string {
	return execFileSync(command, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		timeout: COMMAND_TIMEOUT_MS,
		windowsHide: true,
	}).trim();
}

function systemdEscape(value: string): string {
	return `"${value.replace(/%/g, "%%").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function xmlEscape(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function powershellLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

export function createSystemdUnit(execPath: string, cliPath?: string): string {
	const command = cliPath
		? `${systemdEscape(execPath)} ${systemdEscape(cliPath)} service run --supervision systemd`
		: `${systemdEscape(execPath)} service run --supervision systemd`;
	return `[Unit]
Description=Recode Maestro full-session service
After=default.target
StartLimitIntervalSec=300
StartLimitBurst=4

[Service]
Type=simple
ExecStart=${command}
Restart=on-failure
RestartSec=3
TimeoutStopSec=12
KillMode=control-group
Environment=RECODE_MAESTRO_SUPERVISION=systemd

[Install]
WantedBy=default.target
`;
}

export function createWindowsJobHost(execPath: string, cliPath?: string): string {
	const argumentsValue = cliPath
		? `'"' + ${powershellLiteral(cliPath)} + '" service run --supervision windows-task'`
		: "'service run --supervision windows-task'";
	return `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class MaestroJobHost {
    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public long Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")] private static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll")] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);

    public static int Run(string executable, string arguments) {
        const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception();
        try {
            var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int size = Marshal.SizeOf(limits);
            IntPtr memory = Marshal.AllocHGlobal(size);
            try {
                Marshal.StructureToPtr(limits, memory, false);
                if (!SetInformationJobObject(job, 9, memory, (uint)size)) throw new Win32Exception();
            } finally { Marshal.FreeHGlobal(memory); }
            var start = new ProcessStartInfo(executable, arguments) {
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            using (Process child = Process.Start(start)) {
                if (child == null) throw new InvalidOperationException("Unable to start Maestro");
                if (!AssignProcessToJobObject(job, child.Handle)) {
                    try { child.Kill(); } catch {}
                    throw new Win32Exception();
                }
                child.WaitForExit();
                return child.ExitCode;
            }
        } finally { CloseHandle(job); }
    }
}
'@
$arguments = ${argumentsValue}
exit [MaestroJobHost]::Run(${powershellLiteral(execPath)}, $arguments)
`;
}

export function createWindowsTaskXml(hostScriptPath: string, userId: string): string {
	return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Recode Maestro full-session service</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${xmlEscape(userId)}</UserId></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>${xmlEscape(userId)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author"><Exec><Command>powershell.exe</Command><Arguments>-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File &quot;${xmlEscape(hostScriptPath)}&quot;</Arguments></Exec></Actions>
</Task>
`;
}

function resolveCliPath(): string {
	const currentPath = fileURLToPath(import.meta.url);
	return currentPath.replace(/native-service\.(ts|js)$/, (_match, extension: string) => `cli.${extension}`);
}

async function requestPlannedShutdown(reason: "planned-stop" | "planned-restart"): Promise<boolean> {
	try {
		const response = await sendIpcRequest({ type: "shutdown", reason }, { timeoutMs: 2_000 });
		return response.ok && response.type === "shutdown_result";
	} catch {
		return false;
	}
}

async function waitForServiceRelease(timeoutMs = 10_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (existsSync(getServiceOwnerPath()) && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, SERVICE_READY_POLL_MS));
	}
}

export function summarizeServiceRuntime(
	health: MaestroServiceHealth | undefined,
	processIdentityMatches: boolean,
): string {
	if (!health) return "Maestro runtime: unknown (no persisted health record)";
	if (processIdentityMatches) {
		const state = health.ready ? (health.state === "degraded" ? "degraded" : "running") : health.state;
		return `Maestro runtime: ${state} (PID ${health.processIdentity.pid})`;
	}
	if (health.lastExitClassification === "planned-stop" || health.lastExitClassification === "planned-restart") {
		return `Maestro runtime: stopped (${health.lastExitClassification})`;
	}
	return `Maestro runtime: exited unexpectedly (last persisted state: ${health.state})`;
}

function readServiceRuntimeSummary(): string {
	const health = readPersistedServiceHealth();
	const processIdentityMatches = Boolean(
		health && verifyProcessIdentity(health.processIdentity, inspectLocalProcessIdentity(health.processIdentity.pid)),
	);
	return summarizeServiceRuntime(health, processIdentityMatches);
}

export async function waitForServiceReady(timeoutMs = SERVICE_READY_TIMEOUT_MS): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastState = "unavailable";
	while (Date.now() < deadline) {
		try {
			const response = await sendIpcRequest({ type: "health" }, { timeoutMs: 1_000 });
			if (response.ok && response.type === "health_result" && response.health?.ready) return;
			lastState = response.type === "health_result" ? (response.health?.state ?? "unknown") : response.type;
		} catch (error) {
			lastState = error instanceof Error ? error.message : String(error);
		}
		await new Promise((resolve) => setTimeout(resolve, SERVICE_READY_POLL_MS));
	}
	throw new Error(`Recode Maestro did not become ready within ${timeoutMs}ms (last state: ${lastState})`);
}

export class NativeServiceManager {
	private readonly platform: NativeServicePlatform;
	private readonly runCommand: NativeCommandRunner;
	private readonly execPath: string;
	private readonly cliPath: string | undefined;
	private readonly waitUntilReady: NativeServiceReadyWaiter;

	constructor(
		options: {
			platform?: NativeServicePlatform;
			runCommand?: NativeCommandRunner;
			execPath?: string;
			cliPath?: string;
			waitUntilReady?: NativeServiceReadyWaiter;
		} = {},
	) {
		const platform = options.platform ?? process.platform;
		if (platform !== "linux" && platform !== "win32") {
			throw new Error(`Maestro native service management is unsupported on ${platform}`);
		}
		this.platform = platform;
		this.runCommand = options.runCommand ?? defaultCommandRunner;
		this.execPath = options.execPath ?? process.execPath;
		const runningCompiledBun = Boolean(process.versions.bun && isBunBinary);
		this.cliPath = options.cliPath ?? (runningCompiledBun ? undefined : resolveCliPath());
		this.waitUntilReady = options.waitUntilReady ?? waitForServiceReady;
	}

	async execute(action: NativeServiceAction): Promise<string> {
		if (this.platform === "linux") return await this.executeLinux(action);
		return await this.executeWindows(action);
	}

	private async executeLinux(action: NativeServiceAction): Promise<string> {
		const unitDir = join(homedir(), ".config", "systemd", "user");
		const unitPath = join(unitDir, LINUX_UNIT_NAME);
		switch (action) {
			case "install": {
				if (await requestPlannedShutdown("planned-restart")) await waitForServiceRelease();
				mkdirSync(unitDir, { recursive: true, mode: 0o700 });
				writeFileSync(unitPath, createSystemdUnit(this.execPath, this.cliPath), { encoding: "utf8", mode: 0o600 });
				this.runCommand("systemctl", ["--user", "daemon-reload"]);
				this.runCommand("systemctl", ["--user", "enable", LINUX_UNIT_NAME]);
				const result = this.runCommand("systemctl", ["--user", "restart", LINUX_UNIT_NAME]);
				await this.waitUntilReady();
				return result;
			}
			case "uninstall":
				this.runCommand("systemctl", ["--user", "disable", "--now", LINUX_UNIT_NAME]);
				if (existsSync(unitPath)) rmSync(unitPath);
				return this.runCommand("systemctl", ["--user", "daemon-reload"]);
			case "start": {
				const result = this.runCommand("systemctl", ["--user", "start", LINUX_UNIT_NAME]);
				await this.waitUntilReady();
				return result;
			}
			case "stop":
				if (await requestPlannedShutdown("planned-stop")) await waitForServiceRelease();
				return this.runCommand("systemctl", ["--user", "stop", LINUX_UNIT_NAME]);
			case "restart": {
				if (await requestPlannedShutdown("planned-restart")) await waitForServiceRelease();
				this.runCommand("systemctl", ["--user", "stop", LINUX_UNIT_NAME]);
				const result = this.runCommand("systemctl", ["--user", "start", LINUX_UNIT_NAME]);
				await this.waitUntilReady();
				return result;
			}
			case "status": {
				const nativeStatus = this.runCommand("systemctl", [
					"--user",
					"show",
					LINUX_UNIT_NAME,
					"--property=ActiveState,SubState",
				]);
				return `${readServiceRuntimeSummary()}\n${nativeStatus}`;
			}
		}
	}

	private async executeWindows(action: NativeServiceAction): Promise<string> {
		const serviceDir = getOrchestratorDir();
		const hostPath = join(serviceDir, "recode-maestro-host.ps1");
		const taskPath = join(serviceDir, "recode-maestro-task.xml");
		switch (action) {
			case "install": {
				if (await requestPlannedShutdown("planned-restart")) await waitForServiceRelease();
				try {
					this.runCommand("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME]);
				} catch {
					// The task may not exist yet or may already be stopped.
				}
				mkdirSync(serviceDir, { recursive: true, mode: 0o700 });
				const userId = this.runCommand("whoami.exe", []);
				writeFileSync(hostPath, createWindowsJobHost(this.execPath, this.cliPath), {
					encoding: "utf8",
					mode: 0o600,
				});
				writeFileSync(taskPath, `\ufeff${createWindowsTaskXml(hostPath, userId)}`, {
					encoding: "utf16le",
					mode: 0o600,
				});
				chmodSync(hostPath, 0o600);
				this.runCommand("schtasks.exe", ["/Create", "/TN", WINDOWS_TASK_NAME, "/XML", taskPath, "/F"]);
				const result = this.runCommand("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME]);
				await this.waitUntilReady();
				return result;
			}
			case "uninstall":
				this.runCommand("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME]);
				this.runCommand("schtasks.exe", ["/Delete", "/TN", WINDOWS_TASK_NAME, "/F"]);
				if (existsSync(hostPath)) rmSync(hostPath);
				if (existsSync(taskPath)) rmSync(taskPath);
				return "Recode Maestro task removed";
			case "start": {
				const result = this.runCommand("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME]);
				await this.waitUntilReady();
				return result;
			}
			case "stop":
				if (await requestPlannedShutdown("planned-stop")) await waitForServiceRelease();
				return this.runCommand("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME]);
			case "restart": {
				if (await requestPlannedShutdown("planned-restart")) await waitForServiceRelease();
				this.runCommand("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME]);
				const result = this.runCommand("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME]);
				await this.waitUntilReady();
				return result;
			}
			case "status": {
				const nativeStatus = this.runCommand("schtasks.exe", [
					"/Query",
					"/TN",
					WINDOWS_TASK_NAME,
					"/FO",
					"LIST",
					"/V",
				]);
				return `${readServiceRuntimeSummary()}\n${nativeStatus}`;
			}
		}
	}
}
