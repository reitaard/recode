import { spawnSync } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ProcessIdentityRecord } from "./types.ts";

function receiptsEqual(left: string, right: string): boolean {
	const leftBytes = Buffer.from(left);
	const rightBytes = Buffer.from(right);
	return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

/**
 * Verify both PID and an independently observed process-start receipt.
 * PID equality alone is never sufficient because operating systems reuse PIDs.
 */
export function verifyProcessIdentity(
	expected: Readonly<ProcessIdentityRecord>,
	observed: Readonly<ProcessIdentityRecord> | undefined,
): boolean {
	return Boolean(
		observed &&
			Number.isSafeInteger(expected.pid) &&
			expected.pid > 0 &&
			Number.isSafeInteger(observed.pid) &&
			observed.pid > 0 &&
			expected.pid === observed.pid &&
			typeof expected.startReceipt === "string" &&
			expected.startReceipt.length > 0 &&
			typeof observed.startReceipt === "string" &&
			observed.startReceipt.length > 0 &&
			receiptsEqual(expected.startReceipt, observed.startReceipt),
	);
}

function hashReceipt(parts: readonly string[]): string {
	return createHash("sha256").update(parts.join("\0")).digest("hex");
}

function inspectLinuxProcessIdentity(pid: number): ProcessIdentityRecord | undefined {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8").trim();
		const commandEnd = stat.lastIndexOf(")");
		if (commandEnd === -1) return undefined;
		const fieldsAfterCommand = stat.slice(commandEnd + 2).split(/\s+/);
		const startTicks = fieldsAfterCommand[19];
		if (!startTicks || !/^\d+$/.test(startTicks)) return undefined;
		const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
		if (!bootId) return undefined;
		return { pid, startReceipt: hashReceipt(["linux", bootId, startTicks]) };
	} catch {
		return undefined;
	}
}

function inspectWindowsProcessIdentity(pid: number): ProcessIdentityRecord | undefined {
	const command = [
		"$ErrorActionPreference='Stop'",
		`$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"`,
		"if($null -eq $p){exit 3}",
		"[Console]::Out.Write($p.CreationDate.ToUniversalTime().ToString('O'))",
	].join(";");
	const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
		encoding: "utf8",
		windowsHide: true,
		stdio: ["ignore", "pipe", "ignore"],
	});
	const createdAt = result.status === 0 ? result.stdout.trim() : "";
	return createdAt ? { pid, startReceipt: hashReceipt(["win32", createdAt]) } : undefined;
}

/** Independently observe a local process start receipt on supported service platforms. */
export function inspectLocalProcessIdentity(pid: number): ProcessIdentityRecord | undefined {
	if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
	if (process.platform === "linux") return inspectLinuxProcessIdentity(pid);
	if (process.platform === "win32") return inspectWindowsProcessIdentity(pid);
	return undefined;
}
