import { createModels } from "@reitaard/recode-ai";
import { describe, expect, it } from "vitest";
import { WorkerDirectory } from "../src/core/delegation/worker-directory.ts";
import { createWorkerControlTools } from "../src/core/delegation/worker-tools.ts";
import { RECODE_NAMED_WORKERS } from "../src/core/workers/registry.ts";

describe("worker completion and failure policy", () => {
	it("gives local reasoning workers enough completion budget to reach final text", () => {
		for (const worker of RECODE_NAMED_WORKERS) {
			expect(worker.maxOutputTokens).toBeGreaterThanOrEqual(8_192);
		}
	});

	it("marks failed worker starts terminal and tells the parent not to retry automatically", async () => {
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: RECODE_NAMED_WORKERS,
			getModel: () => undefined,
			models: createModels(),
		});
		const start = createWorkerControlTools(directory).find((tool) => tool.name === "worker_start");
		if (!start) throw new Error("worker_start tool missing");

		const response = await start.execute("failed-start", {
			worker: "audit",
			message: "Inspect one boundary.",
		});
		const text = response.content.find((item) => item.type === "text")?.text ?? "";

		expect(response.terminate).toBe(true);
		expect(text).toContain("AUTOMATIC_RETRY_BLOCKED");
		expect(text).toContain("until a new user message explicitly asks to retry");
	});
});
