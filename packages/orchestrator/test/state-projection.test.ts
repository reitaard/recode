import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { projectMaestroState } from "../src/state-projection.ts";
import type { InstanceRecord } from "../src/types.ts";

function instance(status: InstanceRecord["status"]): InstanceRecord {
	return { id: "instance-1", status, cwd: process.cwd(), createdAt: "2026-07-30T00:00:00.000Z" };
}

describe("Maestro state projection", () => {
	test("maps supervisor states onto the public lifecycle vocabulary", () => {
		assert.deepEqual(projectMaestroState(instance("online"), "RUNNING"), {
			state: "RUNNING",
			consistent: true,
		});
		assert.equal(projectMaestroState({ ...instance("stopped"), terminalState: "CANCELLED" }).state, "CANCELLED");
	});

	test("fails closed when lifecycle and supervisor state diverge", () => {
		const projection = projectMaestroState(instance("waiting-input"), "RUNNING");
		assert.equal(projection.state, "UNKNOWN");
		assert.equal(projection.consistent, false);
		assert.equal(projection.diagnostic, "STATE_DIVERGENCE: instance=waiting-input lifecycle=RUNNING");
	});
});
