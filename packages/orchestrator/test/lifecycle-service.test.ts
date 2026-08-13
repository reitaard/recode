import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MaestroFullSessionLifecycleAdapter, MaestroWorkerLifecycleAdapter } from "../src/lifecycle-adapters.ts";
import {
	isLegalMaestroTransition,
	MAESTRO_LIFECYCLE_STATES,
	type MaestroHandle,
	type MaestroLifecycleState,
	type MaestroTerminalState,
} from "../src/lifecycle-contract.ts";
import { type MaestroLifecycleCompletion, MaestroLifecycleService } from "../src/lifecycle-service.ts";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve = (_value: T): void => undefined;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

async function nextTurn(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

function launchRequest(kind: "worker" | "full-session" = "worker") {
	return {
		kind,
		goal: "Inspect the lifecycle contract",
		role: kind === "worker" ? "audit" : "aizen",
		cwd: process.cwd(),
		workspaceAccess: "read-only",
		parentInstanceId: "parent-instance",
		parentSessionId: "parent-session",
		correlationId: "correlation-1",
	} as const;
}

function terminalAdapter(kind: "worker" | "full-session", state: MaestroTerminalState = "SUCCEEDED") {
	return {
		kind,
		async launch(
			_request: unknown,
			control: { transition(state: "RUNNING"): void },
		): Promise<MaestroLifecycleCompletion> {
			control.transition("RUNNING");
			return { state, summary: "complete" };
		},
	};
}

describe("Maestro lifecycle contract", () => {
	it("defines every legal transition and rejects terminal or UNKNOWN transitions", () => {
		const legal: Readonly<Record<Exclude<MaestroLifecycleState, "UNKNOWN">, readonly MaestroLifecycleState[]>> = {
			PENDING: ["STARTING", "CANCEL_REQUESTED", "FAILED"],
			STARTING: ["RUNNING", "WAITING_INPUT", "CANCEL_REQUESTED", "FAILED", "INTERRUPTED"],
			RUNNING: ["WAITING_INPUT", "CANCEL_REQUESTED", "SUCCEEDED", "FAILED", "INTERRUPTED"],
			WAITING_INPUT: ["RUNNING", "CANCEL_REQUESTED", "SUCCEEDED", "FAILED", "INTERRUPTED"],
			CANCEL_REQUESTED: ["SUCCEEDED", "CANCELLED", "FAILED", "INTERRUPTED"],
			SUCCEEDED: [],
			FAILED: [],
			INTERRUPTED: [],
			CANCELLED: [],
		};
		for (const from of MAESTRO_LIFECYCLE_STATES) {
			for (const to of MAESTRO_LIFECYCLE_STATES) {
				const expected = from === "UNKNOWN" ? false : legal[from].includes(to);
				assert.equal(isLegalMaestroTransition(from, to), expected, `${from} -> ${to}`);
			}
		}
	});

	it("bounds requests and rejects duplicate parent-scoped correlations", () => {
		const service = new MaestroLifecycleService({ adapters: [terminalAdapter("worker")] });
		assert.throws(() => service.launch({ ...launchRequest(), goal: "" }), /goal/);
		assert.throws(() => service.launch({ ...launchRequest(), goal: "x".repeat(16_001) }), /goal/);
		assert.throws(() => service.launch({ ...launchRequest(), context: "x".repeat(32_001) }), /context/);
		assert.throws(() => service.launch({ ...launchRequest(), metadata: { value: "x".repeat(8_192) } }), /metadata/);
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		assert.throws(() => service.launch({ ...launchRequest(), metadata: cyclic }), /JSON-serializable/);
		service.launch(launchRequest());
		assert.throws(() => service.launch(launchRequest()), /Duplicate correlationId/);
		const recovered = service.launch(
			{ ...launchRequest(), correlationId: undefined },
			{ instanceId: "recovered-instance" },
		);
		assert.equal(recovered.instanceId, "recovered-instance");
		assert.throws(
			() => service.launch({ ...launchRequest(), correlationId: undefined }, { instanceId: "recovered-instance" }),
			/lifecycle instance already exists/i,
		);
	});

	it("returns bounded terminal results and deterministic result hashes", async () => {
		const service = new MaestroLifecycleService({
			adapters: [
				{
					kind: "worker",
					async launch(_request, control) {
						control.transition("RUNNING", { progress: { outputTail: "p".repeat(40_000) } });
						return { state: "SUCCEEDED", summary: "s".repeat(40_000) };
					},
				},
			],
		});
		const handle = service.launch(launchRequest());
		const terminal = await service.wait(handle);
		assert.deepEqual(
			{ state: terminal.state, completed: terminal.completed, timedOut: terminal.timedOut },
			{
				state: "SUCCEEDED",
				completed: true,
				timedOut: false,
			},
		);
		const result = service.result(handle);
		assert.equal(result.ready, true);
		assert.equal(result.summary?.length, 32_000);
		assert.match(result.resultHash ?? "", /^[a-f0-9]{64}$/);
		assert.equal(service.status(handle).progress?.outputTail?.length, 32_000);
	});

	it("times out non-destructively and maps worker cancellation to CANCELLED", async () => {
		const worker = new MaestroWorkerLifecycleAdapter(async (_request, context) => {
			await new Promise<void>((_resolve, reject) => {
				context.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
			});
			return { state: "SUCCEEDED" };
		});
		const service = new MaestroLifecycleService({ adapters: [worker] });
		const handle = service.launch(launchRequest());
		await nextTurn();
		const timed = await service.wait(handle, 0);
		assert.equal(timed.timedOut, true);
		assert.equal(timed.completed, false);
		const cancelled = await service.cancel(handle, "Creator cancelled", "command-1");
		assert.equal(cancelled.accepted, true);
		assert.equal((await service.wait(handle)).state, "CANCELLED");
		assert.equal((await service.cancel(handle, "again")).alreadyTerminal, true);
	});

	it("fails forged handles closed, rejects duplicate owners, and rejects stale generations", async () => {
		const service = new MaestroLifecycleService({ adapters: [terminalAdapter("worker")] });
		const handle = service.launch(launchRequest());
		const forged = { ...handle, capability: "x".repeat(handle.capability.length) };
		assert.equal(service.status(forged).state, "UNKNOWN");
		assert.equal(service.result(forged).errorClassification, "UNKNOWN_HANDLE");
		assert.throws(
			() => service.attach({ instanceId: 1 } as unknown as MaestroHandle, "owner"),
			/Invalid, stale, or forged/,
		);
		const first = service.attach(handle, "owner-1");
		assert.throws(() => service.attach(handle, "owner-2"), /Interactive owner already attached/);
		const unchangedState = service.status(handle).state;
		assert.deepEqual(service.detach(first), { detached: true, stale: false, state: unchangedState });
		const second = service.attach(handle, "owner-2");
		const staleCancellation = await service.cancelAttached(handle, first, "stale owner");
		assert.equal(staleCancellation.staleOwner, true);
		const currentState = service.status(handle).state;
		assert.notEqual(currentState, "CANCEL_REQUESTED");
		assert.deepEqual(service.detach(first), { detached: false, stale: true, state: currentState });
		assert.deepEqual(service.detach(second), { detached: true, stale: false, state: currentState });
	});

	it("expires terminal handles consistently and releases their correlation IDs", async () => {
		let now = Date.parse("2026-07-28T00:00:00.000Z");
		const service = new MaestroLifecycleService({
			adapters: [terminalAdapter("worker")],
			terminalRetentionMs: 1_000,
			now: () => new Date(now),
		});
		const handle = service.launch(launchRequest());
		const attachment = service.attach(handle, "owner");
		await service.wait(handle);
		now += 1_001;
		assert.equal((await service.wait(handle, 0)).state, "UNKNOWN");
		assert.equal((await service.cancel(handle, "late")).unknownHandle, true);
		assert.equal((await service.reconnect(handle)).state, "UNKNOWN");
		assert.equal((await service.stop(handle)).state, "UNKNOWN");
		assert.throws(() => service.attach(handle, "late-owner"), /Invalid, stale, or forged/);
		assert.throws(() => service.subscribe(handle, () => undefined), /Invalid, stale, or forged/);
		assert.deepEqual(service.detach(attachment), { detached: false, stale: true, state: "UNKNOWN" });
		assert.doesNotThrow(() => service.launch(launchRequest()));
	});

	it("isolates subscriber failures from state and terminal completion", async () => {
		const completion = deferred<MaestroLifecycleCompletion>();
		const service = new MaestroLifecycleService({
			adapters: [
				{
					kind: "worker",
					async launch(_request, control) {
						control.transition("RUNNING");
						return await completion.promise;
					},
				},
			],
		});
		const handle = service.launch(launchRequest());
		service.subscribe(handle, () => {
			throw new Error("observer failure");
		});
		await nextTurn();
		completion.resolve({ state: "SUCCEEDED", summary: "safe" });
		assert.equal((await service.wait(handle)).state, "SUCCEEDED");
		assert.equal(service.result(handle).ready, true);
	});
});

describe("Maestro full-session adapter", () => {
	it("stops resources acquired after an early cancel or stop", async () => {
		for (const operation of ["cancel", "stop"] as const) {
			const acquired = deferred<{
				identity: { cwd: string };
				completion: Promise<MaestroLifecycleCompletion>;
				stop(): Promise<void>;
			}>();
			let stopped = 0;
			const adapter = new MaestroFullSessionLifecycleAdapter(async () => await acquired.promise);
			const service = new MaestroLifecycleService({ adapters: [adapter] });
			const handle = service.launch({ ...launchRequest("full-session"), correlationId: `early-${operation}` });
			await nextTurn();
			if (operation === "cancel") assert.equal((await service.cancel(handle, "early")).accepted, true);
			else assert.equal((await service.stop(handle)).state, "CANCELLED");
			acquired.resolve({
				identity: { cwd: process.cwd() },
				completion: new Promise<MaestroLifecycleCompletion>(() => undefined),
				async stop() {
					stopped += 1;
				},
			});
			await nextTurn();
			assert.equal(stopped, 1, operation);
			assert.equal((await service.wait(handle, 0)).state, "CANCELLED");
		}
	});

	it("rejects malformed adapter runtime identity and stops the acquired resource", async () => {
		let stopped = false;
		const adapter = new MaestroFullSessionLifecycleAdapter(async () => ({
			identity: { cwd: process.cwd(), process: { pid: -1, startReceipt: "bad" } },
			completion: new Promise<MaestroLifecycleCompletion>(() => undefined),
			async stop() {
				stopped = true;
			},
		}));
		const service = new MaestroLifecycleService({ adapters: [adapter] });
		const handle = service.launch(launchRequest("full-session"));
		assert.equal((await service.wait(handle)).state, "FAILED");
		assert.equal(stopped, true);
		assert.match(service.result(handle).errorMessage ?? "", /Full-session runtime identity/);
	});

	it("keeps process resources private while exposing identity, events, reconnect, and stop", async () => {
		const completion = deferred<MaestroLifecycleCompletion>();
		let stopped = false;
		const adapter = new MaestroFullSessionLifecycleAdapter(async (_request, update) => {
			update({ message: "RPC state ready" });
			return {
				identity: {
					cwd: process.cwd(),
					process: { pid: 1234, startReceipt: "pid-1234-start-99" },
					sessionId: "session-1",
					sessionFile: "session.jsonl",
				},
				completion: completion.promise,
				async cancel() {
					return true;
				},
				async stop() {
					stopped = true;
				},
				async reconnect(status) {
					return { connected: true, state: status.state };
				},
			};
		});
		const service = new MaestroLifecycleService({ adapters: [adapter] });
		const handle = service.launch(launchRequest("full-session"));
		const events: MaestroLifecycleState[] = [];
		const unsubscribe = service.subscribe(handle, (event) => events.push(event.state));
		await nextTurn();
		const status = service.status(handle);
		assert.equal(status.state, "RUNNING");
		assert.deepEqual(status.runtime.process, { pid: 1234, startReceipt: "pid-1234-start-99" });
		assert.equal(status.runtime.sessionId, "session-1");
		assert.equal((await service.reconnect(handle)).connected, true);
		const stoppedStatus = await service.stop(handle);
		assert.equal(stopped, true);
		assert.equal(stoppedStatus.state, "CANCELLED");
		assert.equal("process" in stoppedStatus, false);
		assert.ok(events.includes("RUNNING"));
		unsubscribe();
		completion.resolve({ state: "CANCELLED" });
	});
});
