import type { MaestroLifecycleState } from "./lifecycle-contract.ts";
import type { InstanceRecord } from "./types.ts";

export interface MaestroStateProjection {
	state: MaestroLifecycleState;
	consistent: boolean;
	diagnostic?: string;
}

function instanceLifecycleState(instance: InstanceRecord): MaestroLifecycleState {
	switch (instance.status) {
		case "starting":
			return "STARTING";
		case "online":
			return "RUNNING";
		case "waiting-input":
			return "WAITING_INPUT";
		case "stopping":
			return "CANCEL_REQUESTED";
		case "succeeded":
			return "SUCCEEDED";
		case "failed":
		case "error":
			return "FAILED";
		case "cancelled":
			return "CANCELLED";
		case "stopped":
			return instance.terminalState ?? "INTERRUPTED";
	}
}

export function projectMaestroState(
	instance: InstanceRecord,
	observedLifecycleState?: MaestroLifecycleState,
): MaestroStateProjection {
	const expected = instanceLifecycleState(instance);
	if (observedLifecycleState === undefined || observedLifecycleState === expected) {
		return { state: expected, consistent: true };
	}
	return {
		state: "UNKNOWN",
		consistent: false,
		diagnostic: `STATE_DIVERGENCE: instance=${instance.status} lifecycle=${observedLifecycleState}`,
	};
}
