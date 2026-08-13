export const DEFAULT_AGENT_MAX_ITERATIONS = 500;

/**
 * Per-run provider-call budget. Each agent or worker run owns an independent instance.
 * Synchronous mutation makes consume/refund atomic across interleaved JavaScript tasks.
 */
export class IterationBudget {
	readonly maxTotal: number;
	private usedTotal = 0;

	constructor(maxTotal: number) {
		if (!Number.isSafeInteger(maxTotal) || maxTotal < 1) {
			throw new Error("maxTotal must be a positive safe integer");
		}
		this.maxTotal = maxTotal;
	}

	consume(): boolean {
		if (this.usedTotal >= this.maxTotal) return false;
		this.usedTotal += 1;
		return true;
	}

	refund(): void {
		if (this.usedTotal > 0) this.usedTotal -= 1;
	}

	get used(): number {
		return this.usedTotal;
	}

	get remaining(): number {
		return Math.max(0, this.maxTotal - this.usedTotal);
	}
}
