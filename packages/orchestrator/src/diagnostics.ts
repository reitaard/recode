import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readPersistedServiceHealth, readRestartDiagnostics } from "./service-ownership.ts";
import { projectMaestroState } from "./state-projection.ts";
import { loadInstances } from "./storage.ts";

const MAX_DIAGNOSTIC_INSTANCES = 64;
const MAX_BRANCH_CHARS = 128;

function identity(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function createMaestroDiagnosticBundle(options: {
	version: string;
	releaseManifestPath?: string;
	now?: () => Date;
}): Record<string, unknown> {
	const health = readPersistedServiceHealth();
	const instances = loadInstances();
	let release: unknown;
	if (options.releaseManifestPath && existsSync(options.releaseManifestPath)) {
		try {
			release = JSON.parse(readFileSync(options.releaseManifestPath, "utf8")) as unknown;
		} catch {
			release = { invalid: true };
		}
	}
	return {
		schemaVersion: 1,
		createdAt: (options.now ?? (() => new Date()))().toISOString(),
		runtime: {
			recodeVersion: options.version,
			node: process.version,
			platform: process.platform,
			arch: process.arch,
		},
		release,
		health: health
			? {
					state: health.state,
					ready: health.ready,
					acceptingRequests: health.acceptingRequests,
					supervisionMode: health.supervisionMode,
					liveInstances: health.liveInstances,
					waitingInput: health.waitingInput,
					adapters: health.adapters,
					restartLoopDetected: health.restartLoopDetected,
					lastExitClassification: health.lastExitClassification,
					hasDiagnostic: health.diagnostic !== undefined,
				}
			: undefined,
		restarts: readRestartDiagnostics().map((entry) => ({
			observedAt: entry.observedAt,
			classification: entry.classification,
			detail: entry.detail,
		})),
		instances: instances.slice(-MAX_DIAGNOSTIC_INSTANCES).map((instance) => {
			const projection = projectMaestroState(instance);
			return {
				idHash: identity(instance.id),
				workspaceHash: identity(instance.workspaceReceipt?.worktreeIdentity ?? instance.cwd),
				workspaceAccess: instance.workspaceReceipt?.access,
				branch: instance.workspaceReceipt?.branch?.slice(0, MAX_BRANCH_CHARS),
				status: instance.status,
				lifecycleState: projection.state,
				createdAt: instance.createdAt,
				lastSeenAt: instance.lastSeenAt,
				completedAt: instance.completedAt,
				hasProcessIdentity: instance.processIdentity !== undefined,
				hasSessionIdentity: instance.sessionId !== undefined,
				pendingInput: instance.pendingUiRequest !== undefined || instance.status === "waiting-input",
				hasTerminalDiagnostic: instance.terminalDiagnostic !== undefined,
			};
		}),
	};
}
