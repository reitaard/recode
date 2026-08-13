import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import type { Server } from "node:net";
import { getOrchestratorDir, getSocketPath, isFilesystemSocketPath } from "./config.ts";
import { handleIpcRequest, openRpcStream } from "./handler.ts";
import type { OrchestratorRequest, OrchestratorResponse } from "./ipc/protocol.ts";
import { closeIpcServer, type IpcRequestHandler, startIpcServer } from "./ipc/server.ts";
import { getRadiusOrchestratorBaseUrl, isRadiusEnabled, radiusPresence } from "./radius.ts";
import { acquireServiceOwnership, persistServiceHealth } from "./service-ownership.ts";
import { projectMaestroState } from "./state-projection.ts";
import { supervisor } from "./supervisor.ts";
import type {
	MaestroAdapterState,
	MaestroServiceExitClassification,
	MaestroServiceHealth,
	MaestroSupervisionMode,
} from "./types.ts";

const HEALTH_HEARTBEAT_MS = 5_000;
const SERVICE_DRAIN_DEADLINE_MS = 8_000;

function writeServiceOutput(stream: NodeJS.WriteStream, message: string): void {
	try {
		if (!stream.destroyed) stream.write(`${message}\n`, () => undefined);
	} catch {
		// Native service stdout/stderr may be detached or closed by its host.
	}
}

function removeFilesystemSocket(): void {
	const endpoint = getSocketPath();
	if (isFilesystemSocketPath(endpoint) && existsSync(endpoint)) unlinkSync(endpoint);
}

function parseSupervisionMode(value: string | undefined): MaestroSupervisionMode {
	if (value === "systemd" || value === "windows-task" || value === "manual") return value;
	return "manual";
}

export async function serveMaestro(options: { supervisionMode?: MaestroSupervisionMode } = {}): Promise<void> {
	const supervisionMode = options.supervisionMode ?? parseSupervisionMode(process.env.REPI_MAESTRO_SUPERVISION);
	if (process.env.REPI_MAESTRO_WATCHER) {
		throw new Error("Fallback Maestro watchers are forbidden while native service supervision is available");
	}
	if (process.platform === "linux" && supervisionMode === "windows-task") {
		throw new Error("windows-task supervision is unavailable on Linux");
	}
	if (process.platform === "win32" && supervisionMode === "systemd") {
		throw new Error("systemd supervision is unavailable on Windows");
	}

	const ignoreOutputError = (): void => undefined;
	process.stdout.on("error", ignoreOutputError);
	process.stderr.on("error", ignoreOutputError);
	mkdirSync(getOrchestratorDir(), { recursive: true, mode: 0o700 });
	const ownership = acquireServiceOwnership({ supervisionMode });
	let adapterState: MaestroAdapterState = isRadiusEnabled() ? "initializing" : "disabled";
	let server: Server | undefined;
	let heartbeat: NodeJS.Timeout | undefined;
	let health: MaestroServiceHealth = {
		schemaVersion: 1,
		serviceId: ownership.receipt.serviceId,
		state: "starting",
		ready: false,
		acceptingRequests: false,
		supervisionMode,
		processIdentity: ownership.receipt.processIdentity,
		startedAt: ownership.receipt.startedAt,
		updatedAt: ownership.receipt.startedAt,
		endpoint: ownership.receipt.endpoint,
		liveInstances: 0,
		waitingInput: 0,
		adapters: { radius: adapterState },
		restartLoopDetected: ownership.restartLoopDetected,
		restartDiagnostics: ownership.restartDiagnostics,
		diagnostic: ownership.restartLoopDetected
			? "Native supervisor restart loop detected; service remains available in degraded state"
			: undefined,
	};
	const refreshHealth = (updates: Partial<MaestroServiceHealth> = {}, persist = true): MaestroServiceHealth => {
		const instances = supervisor.listLiveInstances();
		const divergence = instances
			.map((instance) => projectMaestroState(instance, supervisor.getLifecycleStatus(instance.id)?.state))
			.find((projection) => !projection.consistent);
		const requestedState = updates.state ?? health.state;
		const operational = requestedState === "ready" || requestedState === "degraded";
		const degraded = adapterState === "degraded" || ownership.restartLoopDetected || divergence !== undefined;
		const previousDiagnostic = updates.diagnostic ?? health.diagnostic;
		health = {
			...health,
			...updates,
			state: operational ? (degraded ? "degraded" : "ready") : requestedState,
			updatedAt: new Date().toISOString(),
			liveInstances: instances.length,
			waitingInput: instances.filter((instance) => instance.status === "waiting-input").length,
			adapters: { radius: adapterState },
			diagnostic:
				divergence?.diagnostic ??
				(previousDiagnostic?.startsWith("STATE_DIVERGENCE:") ? undefined : previousDiagnostic),
		};
		if (persist) persistServiceHealth(health);
		return health;
	};
	refreshHealth();

	let shutdownPromise: Promise<void> | undefined;
	const shutdown = (
		classification: MaestroServiceExitClassification,
		exitCode: number,
		diagnostic?: string,
	): Promise<void> => {
		if (shutdownPromise) return shutdownPromise;
		shutdownPromise = (async () => {
			let shutdownDiagnostic = diagnostic;
			let drainTimedOut = false;
			try {
				refreshHealth({
					state: classification === "process-crash" ? "crashed" : "draining",
					ready: false,
					acceptingRequests: false,
					lastExitClassification: classification,
					diagnostic,
				});
			} catch (error) {
				shutdownDiagnostic = `Unable to persist draining health: ${error instanceof Error ? error.message : String(error)}`;
			}
			if (heartbeat) clearInterval(heartbeat);
			try {
				if (server) await closeIpcServer(server);
			} catch (error) {
				shutdownDiagnostic = `IPC shutdown failed: ${error instanceof Error ? error.message : String(error)}`;
			}
			let drainTimer: NodeJS.Timeout | undefined;
			let drainResults: PromiseSettledResult<void>[] | undefined;
			try {
				const drainWork = Promise.allSettled([supervisor.shutdown(), radiusPresence.stop()]).then((results) => {
					drainResults = results;
				});
				await Promise.race([
					drainWork,
					new Promise<void>((resolve) => {
						drainTimer = setTimeout(() => {
							drainTimedOut = true;
							resolve();
						}, SERVICE_DRAIN_DEADLINE_MS);
						drainTimer.unref();
					}),
				]);
				const failedDrain = drainResults?.find((result) => result.status === "rejected");
				if (failedDrain?.status === "rejected") {
					shutdownDiagnostic = `Service drain failed: ${failedDrain.reason instanceof Error ? failedDrain.reason.message : String(failedDrain.reason)}`;
				}
			} finally {
				if (drainTimer) clearTimeout(drainTimer);
			}
			try {
				removeFilesystemSocket();
				refreshHealth({
					state: classification === "process-crash" ? "crashed" : "stopped",
					ready: false,
					acceptingRequests: false,
					lastExitClassification: classification,
					diagnostic: drainTimedOut
						? "Service drain deadline expired; native ownership container must complete tree termination"
						: shutdownDiagnostic,
				});
			} finally {
				ownership.release();
				process.exitCode = exitCode;
			}
		})();
		return shutdownPromise;
	};

	const requestHandler = Object.assign(
		async (request: OrchestratorRequest): Promise<OrchestratorResponse> => {
			if (request.type === "health") {
				return { type: "health_result", ok: true, health: refreshHealth({}, false) };
			}
			if (request.type === "shutdown") {
				setImmediate(() => {
					void shutdown(request.reason, 0);
				});
				return { type: "shutdown_result", ok: true, reason: request.reason };
			}
			if (!health.acceptingRequests && request.type !== "list" && request.type !== "status") {
				return { type: "error", ok: false, error: `Maestro service is ${health.state}` };
			}
			return await handleIpcRequest(request);
		},
		{ openRpcStream },
	) as IpcRequestHandler;

	try {
		server = await startIpcServer(requestHandler);
		await supervisor.recoverAfterRestart();
		if (isRadiusEnabled()) {
			try {
				const machine = await radiusPresence.start();
				adapterState = "ready";
				writeServiceOutput(
					process.stdout,
					`radius integration enabled: ${getSocketPath()} -> ${getRadiusOrchestratorBaseUrl()}`,
				);
				if (machine) writeServiceOutput(process.stdout, `radius machine id: ${machine.id}`);
			} catch (error) {
				adapterState = "degraded";
				health.diagnostic = `Radius adapter degraded: ${error instanceof Error ? error.message : String(error)}`;
			}
		}
		const degraded = adapterState === "degraded" || ownership.restartLoopDetected;
		refreshHealth({
			state: degraded ? "degraded" : "ready",
			ready: true,
			acceptingRequests: true,
		});
		heartbeat = setInterval(() => refreshHealth(), HEALTH_HEARTBEAT_MS);
		heartbeat.unref();
		writeServiceOutput(process.stdout, `Maestro listening on ${getSocketPath()} (${supervisionMode})`);
	} catch (error) {
		await shutdown("process-crash", 1, error instanceof Error ? error.message : String(error));
		throw error;
	}

	const onSignal = (signal: NodeJS.Signals): void => {
		if (supervisionMode === "manual") {
			void shutdown("planned-stop", 0);
			return;
		}
		void shutdown("process-crash", 1, `Unexpected ${signal} terminated the natively supervised service`);
	};
	const onFatal = (error: unknown): void => {
		writeServiceOutput(process.stderr, error instanceof Error ? (error.stack ?? error.message) : String(error));
		void shutdown("process-crash", 1, error instanceof Error ? error.message : String(error));
	};
	process.once("SIGINT", onSignal);
	process.once("SIGTERM", onSignal);
	process.once("uncaughtException", onFatal);
	process.once("unhandledRejection", onFatal);

	await new Promise<void>((resolve) => {
		const waitForShutdown = setInterval(() => {
			if (!shutdownPromise) return;
			clearInterval(waitForShutdown);
			shutdownPromise.then(resolve, resolve);
		}, 25);
	});
	process.removeListener("SIGINT", onSignal);
	process.removeListener("SIGTERM", onSignal);
	process.removeListener("uncaughtException", onFatal);
	process.removeListener("unhandledRejection", onFatal);
	process.stdout.removeListener("error", ignoreOutputError);
	process.stderr.removeListener("error", ignoreOutputError);
}
