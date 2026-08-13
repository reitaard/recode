export const LIFECYCLE_READINESS_LEVELS = [
	"frame-ready",
	"input-ready",
	"session-ready",
	"integration-ready",
	"model-ready",
] as const;

export type LifecycleReadinessLevel = (typeof LIFECYCLE_READINESS_LEVELS)[number];

export interface LifecycleReadinessState {
	status: "pending" | "ready";
	readyAt?: number;
}

export interface LifecycleReadinessSnapshot {
	generation: number;
	levels: Record<LifecycleReadinessLevel, LifecycleReadinessState>;
}

export type LifecycleReadinessListener = (snapshot: LifecycleReadinessSnapshot) => void;

function createPendingLevels(): Record<LifecycleReadinessLevel, LifecycleReadinessState> {
	return {
		"frame-ready": { status: "pending" },
		"input-ready": { status: "pending" },
		"session-ready": { status: "pending" },
		"integration-ready": { status: "pending" },
		"model-ready": { status: "pending" },
	};
}

/** Process-local lifecycle state shared by interactive and RPC hosts. */
export class LifecycleReadiness {
	private generation = 0;
	private levels = createPendingLevels();
	private readonly listeners = new Set<LifecycleReadinessListener>();

	beginSession(modelReady: boolean): void {
		this.generation += 1;
		this.levels["session-ready"] = { status: "pending" };
		this.levels["integration-ready"] = { status: "pending" };
		this.levels["model-ready"] = { status: "pending" };
		this.markReady("session-ready");
		if (modelReady) this.markReady("model-ready");
	}

	markReady(level: LifecycleReadinessLevel): boolean {
		if (this.levels[level].status === "ready") return false;
		this.levels[level] = { status: "ready", readyAt: Date.now() };
		this.notify();
		return true;
	}

	markPending(level: LifecycleReadinessLevel): boolean {
		if (this.levels[level].status === "pending") return false;
		this.levels[level] = { status: "pending" };
		this.notify();
		return true;
	}

	isReady(level: LifecycleReadinessLevel): boolean {
		return this.levels[level].status === "ready";
	}

	snapshot(): LifecycleReadinessSnapshot {
		return {
			generation: this.generation,
			levels: {
				"frame-ready": { ...this.levels["frame-ready"] },
				"input-ready": { ...this.levels["input-ready"] },
				"session-ready": { ...this.levels["session-ready"] },
				"integration-ready": { ...this.levels["integration-ready"] },
				"model-ready": { ...this.levels["model-ready"] },
			},
		};
	}

	onChange(listener: LifecycleReadinessListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		const snapshot = this.snapshot();
		for (const listener of this.listeners) listener(snapshot);
	}
}
