import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	extractRecodeTeachCandidate,
	RecodeTeachController,
	recodeTeachPrompt,
} from "../src/core/recode-teach/recode-teach-controller.ts";

async function createController(): Promise<RecodeTeachController> {
	const root = await mkdtemp(join(tmpdir(), "repi-teach-"));
	return new RecodeTeachController({
		id: "aizen",
		displayName: "Aizen",
		kind: "aizen",
		root,
	});
}

describe("RecodeTeachController", () => {
	it("persists teach mode and owner-scoped proposals", async () => {
		const controller = await createController();
		await controller.setEnabled(true);
		const proposal = await controller.stage(
			{
				text: "Run the focused regression before the full validation gate.",
				tags: ["Workflow", " validation "],
				scope: "project",
				kind: "procedure",
				reason: "Prevents slow feedback while preserving the final gate.",
			},
			{ session: "session-1", turn: 3, reviewModel: "test-model" },
		);

		const restored = new RecodeTeachController(controller.owner);
		expect(await restored.isEnabled()).toBe(true);
		expect(await restored.listProposals("pending")).toEqual([
			expect.objectContaining({
				id: proposal.id,
				ownerId: "aizen",
				sourceSession: "session-1",
				sourceTurn: 3,
				sourceActor: {
					id: "creator",
					displayName: "Creator",
					role: "creator",
				},
				status: "pending",
				proposedVersion: expect.objectContaining({
					tags: ["procedure", "workflow", "validation", "creator-taught", "owner-aizen"],
				}),
			}),
		]);
		expect(JSON.parse(await readFile(controller.statePath, "utf8"))).toMatchObject({
			version: 1,
			enabled: true,
		});
	});

	it("deduplicates pending proposals and records resolution", async () => {
		const controller = await createController();
		const source = { session: "session-1", turn: 1, reviewModel: "test-model" };
		const candidate = {
			text: "Keep Cardinal as the only agent-originated memory admission path.",
			tags: ["memory"],
			scope: "project" as const,
			kind: "decision" as const,
			reason: "Avoids competing memory writers.",
		};
		const first = await controller.stage(candidate, source);
		const duplicate = await controller.stage({ ...candidate, text: candidate.text.toUpperCase() }, source);
		expect(duplicate.id).toBe(first.id);

		const approved = await controller.resolve(first.id, "approved");
		expect(approved.status).toBe("approved");
		expect(approved.resolvedAt).toBeTypeOf("string");
		await expect(controller.resolve(first.id, "rejected")).rejects.toThrow("already approved");
	});
});

describe("teach proposal extraction", () => {
	it("removes a valid proposal from visible output", () => {
		const output = `Useful answer.
<recode-teach-proposal>{"text":"Use one Cardinal admission path for durable memory.","tags":["memory"],"scope":"project","kind":"decision","reason":"Prevents split-brain writes."}</recode-teach-proposal>`;
		expect(extractRecodeTeachCandidate(output)).toEqual({
			visibleOutput: "Useful answer.",
			candidate: {
				text: "Use one Cardinal admission path for durable memory.",
				tags: ["decision", "memory"],
				scope: "project",
				kind: "decision",
				reason: "Prevents split-brain writes.",
			},
		});
	});

	it("keeps malformed candidate data out of the visible answer", () => {
		const output = `Answer
<recode-teach-proposal>not json</recode-teach-proposal>`;
		expect(extractRecodeTeachCandidate(output)).toEqual({ visibleOutput: "Answer" });
	});

	it("describes staged ownership without claiming a save", async () => {
		const controller = await createController();
		const prompt = recodeTeachPrompt(controller.owner);
		expect(prompt).toContain("Teach Mode is active for Aizen");
		expect(prompt).toContain("Never claim that a lesson was saved");
		expect(prompt).toContain("Do not call kioku_write");
	});
});
