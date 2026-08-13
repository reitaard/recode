export interface ActiveWorkerHeaderState {
	workerId: string;
	workerName: string;
	status: string;
	turnCount: number;
	memoryDocumentCount: number;
	sessionCount: number;
	evaluationCount: number;
}

let activeWorkerHeaderState: ActiveWorkerHeaderState | undefined;

export function getActiveWorkerHeaderState(): ActiveWorkerHeaderState | undefined {
	return activeWorkerHeaderState;
}

export function setActiveWorkerHeaderState(state: ActiveWorkerHeaderState | undefined): void {
	activeWorkerHeaderState = state;
}
