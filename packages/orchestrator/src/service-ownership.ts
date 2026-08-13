import { randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { getServiceHealthPath, getServiceOwnerPath, getServiceRestartHistoryPath, getSocketPath } from "./config.ts";
import { inspectLocalProcessIdentity, verifyProcessIdentity } from "./process-identity.ts";
import type {
	MaestroRestartDiagnostic,
	MaestroServiceHealth,
	MaestroServiceOwnerReceipt,
	MaestroSupervisionMode,
	ProcessIdentityRecord,
} from "./types.ts";

const MAX_RESTART_DIAGNOSTICS = 16;
const RESTART_LOOP_WINDOW_MS = 5 * 60_000;
const RESTART_LOOP_THRESHOLD = 3;

function parseJsonFile(path: string): unknown {
	return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function isProcessIdentity(value: unknown): value is ProcessIdentityRecord {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.pid === "number" &&
		Number.isSafeInteger(candidate.pid) &&
		candidate.pid > 0 &&
		typeof candidate.startReceipt === "string" &&
		candidate.startReceipt.length === 64
	);
}

function isOwnerReceipt(value: unknown): value is MaestroServiceOwnerReceipt {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.schemaVersion === 1 &&
		typeof candidate.serviceId === "string" &&
		candidate.serviceId.length > 0 &&
		isProcessIdentity(candidate.processIdentity) &&
		typeof candidate.startedAt === "string" &&
		(candidate.supervisionMode === "manual" ||
			candidate.supervisionMode === "systemd" ||
			candidate.supervisionMode === "windows-task") &&
		typeof candidate.endpoint === "string" &&
		candidate.endpoint.length > 0
	);
}

function atomicWriteJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	const descriptor = openSync(temporaryPath, "wx", 0o600);
	try {
		writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
	renameSync(temporaryPath, path);
}

export function readRestartDiagnostics(): MaestroRestartDiagnostic[] {
	try {
		const value = parseJsonFile(getServiceRestartHistoryPath());
		if (!Array.isArray(value)) return [];
		return value
			.filter((entry): entry is MaestroRestartDiagnostic => {
				if (typeof entry !== "object" || entry === null) return false;
				const candidate = entry as Record<string, unknown>;
				return (
					typeof candidate.observedAt === "string" &&
					(candidate.classification === "planned-stop" ||
						candidate.classification === "planned-restart" ||
						candidate.classification === "process-crash") &&
					typeof candidate.detail === "string"
				);
			})
			.slice(-MAX_RESTART_DIAGNOSTICS);
	} catch {
		return [];
	}
}

function appendRestartDiagnostic(diagnostic: MaestroRestartDiagnostic): MaestroRestartDiagnostic[] {
	const diagnostics = [...readRestartDiagnostics(), diagnostic].slice(-MAX_RESTART_DIAGNOSTICS);
	atomicWriteJson(getServiceRestartHistoryPath(), diagnostics);
	return diagnostics;
}

function classifyPreviousOwner(previousOwner: MaestroServiceOwnerReceipt): MaestroRestartDiagnostic {
	try {
		const health = parseJsonFile(getServiceHealthPath()) as Partial<MaestroServiceHealth>;
		if (
			health.serviceId === previousOwner.serviceId &&
			(health.lastExitClassification === "planned-stop" || health.lastExitClassification === "planned-restart")
		) {
			return {
				observedAt: new Date().toISOString(),
				classification: health.lastExitClassification,
				previousServiceId: previousOwner.serviceId,
				detail: `Previous Maestro owner exited with ${health.lastExitClassification}`,
			};
		}
	} catch {
		// A missing health snapshot means the previous verified owner did not complete a planned shutdown record.
	}
	return {
		observedAt: new Date().toISOString(),
		classification: "process-crash",
		previousServiceId: previousOwner.serviceId,
		detail: "Previous verified Maestro owner disappeared without a planned shutdown record",
	};
}

export interface AcquiredServiceOwnership {
	receipt: MaestroServiceOwnerReceipt;
	restartDiagnostics: MaestroRestartDiagnostic[];
	restartLoopDetected: boolean;
	release(): void;
}

export interface AcquireServiceOwnershipOptions {
	supervisionMode: MaestroSupervisionMode;
	inspectProcessIdentity?: (pid: number) => ProcessIdentityRecord | undefined;
	now?: () => Date;
}

export function acquireServiceOwnership(options: AcquireServiceOwnershipOptions): AcquiredServiceOwnership {
	if (process.platform !== "linux" && process.platform !== "win32") {
		throw new Error(`Maestro native service supervision is unsupported on ${process.platform}`);
	}
	const inspect = options.inspectProcessIdentity ?? inspectLocalProcessIdentity;
	const now = options.now ?? (() => new Date());
	const processIdentity = inspect(process.pid);
	if (!processIdentity) throw new Error("Unable to establish the Maestro service process-start receipt");
	const ownerPath = getServiceOwnerPath();
	mkdirSync(dirname(ownerPath), { recursive: true, mode: 0o700 });
	let restartDiagnostics = readRestartDiagnostics();

	for (let attempt = 0; attempt < 4; attempt++) {
		const receipt: MaestroServiceOwnerReceipt = {
			schemaVersion: 1,
			serviceId: randomUUID(),
			processIdentity,
			startedAt: now().toISOString(),
			supervisionMode: options.supervisionMode,
			endpoint: getSocketPath(),
		};
		try {
			const descriptor = openSync(ownerPath, "wx", 0o600);
			try {
				writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
				fsyncSync(descriptor);
			} finally {
				closeSync(descriptor);
			}
			const recentCrashCount = restartDiagnostics.filter(
				(entry) =>
					entry.classification === "process-crash" &&
					now().getTime() - new Date(entry.observedAt).getTime() <= RESTART_LOOP_WINDOW_MS,
			).length;
			let released = false;
			return {
				receipt,
				restartDiagnostics,
				restartLoopDetected: recentCrashCount >= RESTART_LOOP_THRESHOLD,
				release(): void {
					if (released) return;
					released = true;
					try {
						const current = parseJsonFile(ownerPath);
						if (isOwnerReceipt(current) && current.serviceId === receipt.serviceId) unlinkSync(ownerPath);
					} catch {
						// Never remove an owner file that no longer proves this process owns it.
					}
				},
			};
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EEXIST") throw error;
		}

		let existing: MaestroServiceOwnerReceipt;
		try {
			const parsed = parseJsonFile(ownerPath);
			if (!isOwnerReceipt(parsed)) {
				throw new Error(`Maestro owner receipt is malformed; refusing ambiguous cleanup: ${ownerPath}`);
			}
			existing = parsed;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		if (verifyProcessIdentity(existing.processIdentity, inspect(existing.processIdentity.pid))) {
			throw new Error(`Maestro service is already owned by PID ${existing.processIdentity.pid}`);
		}

		const stalePath = `${ownerPath}.stale.${existing.serviceId}`;
		try {
			renameSync(ownerPath, stalePath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		restartDiagnostics = appendRestartDiagnostic(classifyPreviousOwner(existing));
		try {
			unlinkSync(stalePath);
		} catch {
			// The bounded history is authoritative; stale receipt cleanup is best effort after verified replacement.
		}
	}
	throw new Error("Unable to acquire Maestro service ownership after bounded retries");
}

export function persistServiceHealth(health: MaestroServiceHealth): void {
	atomicWriteJson(getServiceHealthPath(), health);
}

export function readPersistedServiceHealth(): MaestroServiceHealth | undefined {
	if (!existsSync(getServiceHealthPath())) return undefined;
	try {
		const value = parseJsonFile(getServiceHealthPath());
		if (typeof value !== "object" || value === null) return undefined;
		return value as MaestroServiceHealth;
	} catch {
		return undefined;
	}
}
