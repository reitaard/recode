import type {
	MaestroHandle,
	MaestroLaunchRequest,
	MaestroProgressSnapshot,
	MaestroReconnectResult,
	MaestroRuntimeIdentity,
	MaestroStatus,
} from "./lifecycle-contract.ts";
import type {
	MaestroLifecycleAdapter,
	MaestroLifecycleCompletion,
	MaestroLifecycleControl,
} from "./lifecycle-service.ts";

export interface MaestroWorkerRunContext {
	signal: AbortSignal;
	update(progress: MaestroProgressSnapshot): void;
}

export type MaestroWorkerRunner = (
	request: Readonly<MaestroLaunchRequest>,
	context: MaestroWorkerRunContext,
) => Promise<MaestroLifecycleCompletion>;

/** Adapter for bounded named-worker turns. No worker/session object crosses the lifecycle boundary. */
export class MaestroWorkerLifecycleAdapter implements MaestroLifecycleAdapter {
	readonly kind = "worker" as const;
	private readonly runner: MaestroWorkerRunner;
	private readonly controllers = new Map<string, AbortController>();

	constructor(runner: MaestroWorkerRunner) {
		this.runner = runner;
	}

	async launch(
		request: Readonly<MaestroLaunchRequest>,
		control: MaestroLifecycleControl,
	): Promise<MaestroLifecycleCompletion> {
		const controller = new AbortController();
		this.controllers.set(control.handle.instanceId, controller);
		control.transition("RUNNING");
		try {
			return await this.runner(request, {
				signal: controller.signal,
				update: (progress) => control.update({ progress }),
			});
		} catch (error) {
			if (controller.signal.aborted) return { state: "CANCELLED", summary: "Worker cancelled" };
			throw error;
		} finally {
			this.controllers.delete(control.handle.instanceId);
		}
	}

	async cancel(handle: Readonly<MaestroHandle>, reason: string): Promise<boolean> {
		const controller = this.controllers.get(handle.instanceId);
		if (!controller) return false;
		controller.abort(reason);
		return true;
	}

	async stop(handle: Readonly<MaestroHandle>): Promise<void> {
		this.controllers.get(handle.instanceId)?.abort("Stopped by Maestro");
	}
}

export interface MaestroFullSessionResource {
	identity: MaestroRuntimeIdentity;
	waitingInput?: boolean;
	completion: Promise<MaestroLifecycleCompletion>;
	cancel?(reason: string, commandId?: string): Promise<boolean>;
	stop(): Promise<void>;
	reconnect?(status: Readonly<MaestroStatus>): Promise<MaestroReconnectResult>;
}

export type MaestroFullSessionLauncher = (
	request: Readonly<MaestroLaunchRequest>,
	update: (progress: MaestroProgressSnapshot) => void,
	handle: Readonly<MaestroHandle>,
) => Promise<MaestroFullSessionResource>;

interface FullSessionOperation {
	resource?: MaestroFullSessionResource;
	cancelRequest?: { reason: string; commandId?: string };
	stopRequested: boolean;
}

/** Adapter for a complete Aizen RPC process. The resource remains private to Maestro. */
export class MaestroFullSessionLifecycleAdapter implements MaestroLifecycleAdapter {
	readonly kind = "full-session" as const;
	private readonly launcher: MaestroFullSessionLauncher;
	private readonly operations = new Map<string, FullSessionOperation>();

	constructor(launcher: MaestroFullSessionLauncher) {
		this.launcher = launcher;
	}

	async launch(
		request: Readonly<MaestroLaunchRequest>,
		control: MaestroLifecycleControl,
	): Promise<MaestroLifecycleCompletion> {
		const operation: FullSessionOperation = { stopRequested: false };
		this.operations.set(control.handle.instanceId, operation);
		let handedOff = false;
		try {
			const resource = await this.launcher(request, (progress) => control.update({ progress }), control.handle);
			operation.resource = resource;
			if (operation.stopRequested) {
				await resource.stop();
				return { state: "CANCELLED", summary: "Session stopped during launch" };
			}
			if (operation.cancelRequest) {
				const { reason, commandId } = operation.cancelRequest;
				const accepted = resource.cancel ? await resource.cancel(reason, commandId) : false;
				if (!accepted) {
					await resource.stop();
					return { state: "CANCELLED", summary: "Session cancelled during launch" };
				}
			} else {
				control.transition(resource.waitingInput ? "WAITING_INPUT" : "RUNNING", { runtime: resource.identity });
				handedOff = true;
			}
			return await resource.completion;
		} catch (error) {
			if (operation.resource && !handedOff) await operation.resource.stop();
			throw error;
		} finally {
			this.operations.delete(control.handle.instanceId);
		}
	}

	async cancel(handle: Readonly<MaestroHandle>, reason: string, commandId?: string): Promise<boolean> {
		const operation = this.operations.get(handle.instanceId);
		if (!operation) return false;
		operation.cancelRequest = { reason, commandId };
		if (!operation.resource) return true;
		return operation.resource.cancel ? await operation.resource.cancel(reason, commandId) : false;
	}

	async stop(handle: Readonly<MaestroHandle>): Promise<void> {
		const operation = this.operations.get(handle.instanceId);
		if (!operation) return;
		operation.stopRequested = true;
		if (operation.resource) await operation.resource.stop();
	}

	async reconnect(handle: Readonly<MaestroHandle>, status: Readonly<MaestroStatus>): Promise<MaestroReconnectResult> {
		const resource = this.operations.get(handle.instanceId)?.resource;
		if (!resource) return { connected: false, state: "UNKNOWN", diagnostic: "RECONNECT_UNAVAILABLE" };
		return resource.reconnect ? await resource.reconnect(status) : { connected: true, state: status.state };
	}
}
