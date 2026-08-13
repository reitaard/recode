import type { ImageContent } from "@reitaard/recode-ai";

export interface RecodeGatewayInboundMessage {
	channel: string;
	conversationId: string;
	messageId: string;
	text: string;
	images?: ImageContent[];
}

export interface RecodeGatewayDelivery {
	begin(): Promise<void>;
	progress(text: string): Promise<void>;
	update(text: string): Promise<void>;
	complete(text: string): Promise<void>;
	fail(message: string): Promise<void>;
}

export interface RecodeGatewayRuntime {
	run(
		prompt: string,
		onText: (text: string) => void,
		images?: ImageContent[],
		onActivity?: (text: string) => void,
	): Promise<void>;
	abort(): Promise<void>;
	close(): Promise<void>;
}

export interface RecodeGatewaySessionStore {
	getSessionId(route: string): string | undefined;
	setSessionId(route: string, sessionId: string): void;
}

export interface RecodeGatewayAcceptedJob {
	id: string;
	message: RecodeGatewayInboundMessage;
}

export interface RecodeGatewayJobLedger {
	accept(message: RecodeGatewayInboundMessage): RecodeGatewayAcceptedJob | undefined;
	recoverAccepted(): RecodeGatewayAcceptedJob[];
	setJobStatus(id: string, status: "running" | "completed" | "failed" | "interrupted", error?: string): void;
}

export interface RecodeGatewayOptions {
	sessions: RecodeGatewaySessionStore;
	jobs?: RecodeGatewayJobLedger;
	createRuntime(route: string, sessionId: string): Promise<RecodeGatewayRuntime>;
	createSessionId(message: RecodeGatewayInboundMessage): string;
}

interface QueuedGatewayTurn {
	jobId?: string;
	message: RecodeGatewayInboundMessage;
	delivery: RecodeGatewayDelivery;
}

export interface RecodeGatewayStatus {
	running: boolean;
	queued: number;
	activeJobId?: string;
	uptimeMs: number;
}

export interface RecodeGatewaySubmission extends RecodeGatewayStatus {
	accepted: boolean;
}

class RecodeGatewayTurnAborted extends Error {}

/**
 * Channel-neutral owner of session routing and sequential Aizen execution.
 * Adapters normalize inbound messages and own their transport-specific delivery.
 */
export class RecodeGateway {
	private readonly options: RecodeGatewayOptions;
	private readonly queue: QueuedGatewayTurn[] = [];
	private readonly runtimes = new Map<string, RecodeGatewayRuntime>();
	private activeRuntime: RecodeGatewayRuntime | undefined;
	private activeJobId: string | undefined;
	private running = false;
	private closeRequested = false;
	private abortVersion = 0;
	private readonly startedAt = Date.now();

	constructor(options: RecodeGatewayOptions) {
		this.options = options;
	}

	getStatus(): RecodeGatewayStatus {
		return {
			running: this.running,
			queued: this.queue.length,
			activeJobId: this.activeJobId,
			uptimeMs: Date.now() - this.startedAt,
		};
	}

	submit(message: RecodeGatewayInboundMessage, delivery: RecodeGatewayDelivery): RecodeGatewaySubmission {
		if (this.closeRequested) throw new Error("Recode Gateway is closed");
		const job = this.options.jobs?.accept(message);
		if (this.options.jobs && !job) return { ...this.getStatus(), accepted: false };
		this.queue.push({ jobId: job?.id, message, delivery });
		const status = { ...this.getStatus(), accepted: true };
		if (!this.running) void this.drainQueue();
		return status;
	}

	recover(createDelivery: (message: RecodeGatewayInboundMessage) => RecodeGatewayDelivery): number {
		const jobs = this.options.jobs?.recoverAccepted() ?? [];
		for (const job of jobs)
			this.queue.push({ jobId: job.id, message: job.message, delivery: createDelivery(job.message) });
		if (jobs.length > 0 && !this.running) void this.drainQueue();
		return jobs.length;
	}

	async abort(): Promise<void> {
		this.abortVersion += 1;
		for (const turn of this.queue) {
			if (turn.jobId) this.options.jobs?.setJobStatus(turn.jobId, "interrupted");
		}
		this.queue.length = 0;
		if (this.activeJobId) this.options.jobs?.setJobStatus(this.activeJobId, "interrupted");
		await this.activeRuntime?.abort();
	}

	async reset(message: RecodeGatewayInboundMessage): Promise<boolean> {
		if (this.running) return false;
		const route = this.routeFor(message);
		const runtime = this.runtimes.get(route);
		if (runtime) await runtime.close();
		this.runtimes.delete(route);
		this.options.sessions.setSessionId(route, this.options.createSessionId(message));
		return true;
	}

	/** Restart one route's runtime so project resources are loaded again without rotating its session. */
	async reload(message: RecodeGatewayInboundMessage): Promise<boolean> {
		if (this.running) return false;
		const route = this.routeFor(message);
		const runtime = this.runtimes.get(route);
		if (runtime) await runtime.close();
		this.runtimes.delete(route);
		return true;
	}

	async close(): Promise<void> {
		this.closeRequested = true;
		this.abortVersion += 1;
		this.queue.length = 0;
		if (this.activeJobId) this.options.jobs?.setJobStatus(this.activeJobId, "interrupted");
		await this.activeRuntime?.abort();
		await Promise.all([...this.runtimes.values()].map((runtime) => runtime.close()));
		this.runtimes.clear();
		this.activeRuntime = undefined;
		this.activeJobId = undefined;
	}

	private routeFor(message: RecodeGatewayInboundMessage): string {
		return `${message.channel}:${message.conversationId}`;
	}

	private async runtimeFor(message: RecodeGatewayInboundMessage): Promise<RecodeGatewayRuntime> {
		const route = this.routeFor(message);
		const existing = this.runtimes.get(route);
		if (existing) return existing;
		const sessionId = this.options.sessions.getSessionId(route) ?? this.options.createSessionId(message);
		this.options.sessions.setSessionId(route, sessionId);
		const runtime = await this.options.createRuntime(route, sessionId);
		this.runtimes.set(route, runtime);
		return runtime;
	}

	private async drainQueue(): Promise<void> {
		if (this.running || this.closeRequested) return;
		this.running = true;
		try {
			while (!this.closeRequested && this.queue.length > 0) {
				const turn = this.queue.shift();
				if (!turn) break;
				const turnAbortVersion = this.abortVersion;
				try {
					this.activeJobId = turn.jobId;
					if (turn.jobId) this.options.jobs?.setJobStatus(turn.jobId, "running");
					await turn.delivery.begin();
					const runtime = await this.runtimeFor(turn.message);
					this.activeRuntime = runtime;
					if (turnAbortVersion !== this.abortVersion) {
						await runtime.abort();
						throw new RecodeGatewayTurnAborted();
					}
					let finalText = "";
					let deliveryUpdates = Promise.resolve();
					await runtime.run(
						turn.message.text,
						(text) => {
							finalText = text;
							deliveryUpdates = deliveryUpdates.then(() => turn.delivery.update(text));
						},
						turn.message.images,
						(text) => {
							deliveryUpdates = deliveryUpdates.then(() => turn.delivery.progress(text));
						},
					);
					await deliveryUpdates;
					if (turnAbortVersion !== this.abortVersion) throw new RecodeGatewayTurnAborted();
					await turn.delivery.complete(finalText || "Completed without a text response.");
					if (turn.jobId) this.options.jobs?.setJobStatus(turn.jobId, "completed");
				} catch (error: unknown) {
					if (!(error instanceof RecodeGatewayTurnAborted)) {
						if (turn.jobId) {
							this.options.jobs?.setJobStatus(
								turn.jobId,
								"failed",
								error instanceof Error ? error.message : String(error),
							);
						}
						await turn.delivery.fail(error instanceof Error ? error.message : String(error));
					}
				} finally {
					this.activeRuntime = undefined;
					this.activeJobId = undefined;
				}
			}
		} finally {
			this.running = false;
		}
	}
}
