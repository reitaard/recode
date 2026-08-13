import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool } from "@reitaard/recode-agent-core";
import { createModels, fauxAssistantMessage, fauxProvider, type RegisterFauxProviderOptions } from "@reitaard/recode-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { createDelegateTool } from "../src/core/delegation/delegate-tool.ts";
import { type NamedWorkerDefinition, runNamedWorker } from "../src/core/delegation/named-worker.ts";
import { RECODE_NAMED_WORKERS } from "../src/core/workers/registry.ts";

let providerCount = 0;

function createFaux(options: RegisterFauxProviderOptions = {}) {
	const registration = fauxProvider({ provider: `delegation-test-${++providerCount}`, ...options });
	const models = createModels();
	models.setProvider(registration.provider);
	return { registration, models };
}

function worker(overrides: Partial<NamedWorkerDefinition> = {}): NamedWorkerDefinition {
	return {
		id: "reviewer",
		displayName: "Reviewer",
		description: "Inspects code and returns focused evidence.",
		...overrides,
	};
}

function messageText(messages: Array<{ role: string; content: unknown }>): string {
	return messages
		.flatMap((message) => {
			if (typeof message.content === "string") return [message.content];
			if (!Array.isArray(message.content)) return [];
			return message.content.flatMap((part) =>
				part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part
					? [String(part.text)]
					: [],
			);
		})
		.join("\n");
}

describe("named worker delegation", () => {
	it("registers the stable worker ids with swappable display names", () => {
		expect(RECODE_NAMED_WORKERS.map(({ id, displayName, aliases }) => ({ id, displayName, aliases }))).toEqual([
			{ id: "research", displayName: "Mayuri", aliases: ["研究"] },
			{ id: "audit", displayName: "Levi", aliases: ["監査"] },
			{ id: "shiori", displayName: "Shiori", aliases: ["栞"] },
		]);
		expect(RECODE_NAMED_WORKERS.find((candidate) => candidate.id === "research")?.skillName).toBe("librarian");
		expect(RECODE_NAMED_WORKERS.find((candidate) => candidate.id === "research")?.tools).toEqual([
			"web_search",
			"fetch_content",
			"get_search_content",
		]);
		expect(RECODE_NAMED_WORKERS.find((candidate) => candidate.id === "research")?.tools).not.toContain("read");
		expect(RECODE_NAMED_WORKERS.find((candidate) => candidate.id === "shiori")?.tools).toEqual([
			"read",
			"grep",
			"find",
			"ls",
		]);
		expect(RECODE_NAMED_WORKERS.find((candidate) => candidate.id === "shiori")?.tools).not.toContain("kioku_write");
		expect(RECODE_NAMED_WORKERS.every((candidate) => Boolean(candidate.personality))).toBe(true);
	});

	it("runs one isolated named worker with only read-only tools", async () => {
		const { registration, models } = createFaux();
		let toolNames: string[] = [];
		let systemPrompt = "";
		registration.setResponses([
			(context) => {
				toolNames = context.tools?.map((tool) => tool.name) ?? [];
				systemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("Found one concrete issue in src/example.ts.");
			},
		]);

		const result = await runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: worker({ personality: "Calm and exact." }),
			task: "Inspect the example module.",
		});

		expect(result.status).toBe("completed");
		expect(result.output).toContain("concrete issue");
		expect(result.workerId).toBe("reviewer");
		expect(toolNames).toEqual(["read", "grep", "find", "ls"]);
		expect(toolNames).not.toContain("delegate");
		expect(systemPrompt).toContain("You are Reviewer");
		expect(systemPrompt).toContain("Do not delegate");
		expect(systemPrompt).toContain("Personality: Calm and exact.");
	});

	it("runs Shiori as a normal read-only private worker without Kioku write access", async () => {
		const { registration, models } = createFaux();
		let toolNames: string[] = [];
		let systemPrompt = "";
		registration.setResponses([
			(context) => {
				toolNames = context.tools?.map((tool) => tool.name) ?? [];
				systemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("I can help organize that knowledge without claiming it was saved.");
			},
		]);
		const shiori = RECODE_NAMED_WORKERS.find((candidate) => candidate.id === "shiori");
		if (!shiori) throw new Error("Shiori worker missing");

		const result = await runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: shiori,
			task: "Help organize this project decision.",
		});

		expect(result.status).toBe("completed");
		expect(toolNames).toEqual(["read", "grep", "find", "ls"]);
		expect(toolNames).not.toContain("kioku_write");
		expect(systemPrompt).toContain("normal private conversation");
		expect(systemPrompt).toContain("Cardinal remains the only admission path into Kioku");
	});

	it("explicitly invokes Mayuri's loaded librarian skill", async () => {
		const { registration, models } = createFaux();
		const dir = await mkdtemp(join(tmpdir(), "repi-librarian-"));
		const skillPath = join(dir, "SKILL.md");
		await writeFile(
			skillPath,
			"---\nname: librarian\ndescription: Find authoritative sources.\n---\n\n# Librarian\nPrefer authoritative sources.",
			"utf8",
		);
		let prompt = "";
		registration.setResponses([
			(context) => {
				prompt = messageText(context.messages);
				return fauxAssistantMessage("Research complete.");
			},
		]);

		try {
			const result = await runNamedWorker({
				cwd: process.cwd(),
				model: registration.getModel(),
				models,
				worker: worker({ id: "research", displayName: "Mayuri", skillName: "librarian" }),
				skills: [
					{
						name: "librarian",
						description: "Find authoritative sources.",
						filePath: skillPath,
					},
				],
				task: "Find the authoritative lifecycle documentation.",
			});

			expect(result.status).toBe("completed");
			expect(prompt).toContain('<skill name="librarian"');
			expect(prompt).toContain("Prefer authoritative sources");
			expect(prompt).toContain("Find the authoritative lifecycle documentation");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("returns a typed failure when a required worker skill is not loaded", async () => {
		const { registration, models } = createFaux();
		const result = await runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: worker({ id: "research", displayName: "Mayuri", skillName: "librarian" }),
			task: "Research the repository.",
		});

		expect(result.status).toBe("failed");
		expect(result.error).toContain('requires the loaded skill "librarian"');
	});

	it("supports a smaller worker-specific read-only tool set", async () => {
		const { registration, models } = createFaux();
		let toolNames: string[] = [];
		registration.setResponses([
			(context) => {
				toolNames = context.tools?.map((tool) => tool.name) ?? [];
				return fauxAssistantMessage("done");
			},
		]);

		const result = await runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: worker({ tools: ["read", "grep"] }),
			task: "Inspect only matching source text.",
		});

		expect(result.status).toBe("completed");
		expect(toolNames).toEqual(["read", "grep"]);
	});

	it("runs a web-only worker with only explicitly supplied extension tools", async () => {
		const { registration, models } = createFaux();
		let toolNames: string[] = [];
		let systemPrompt = "";
		registration.setResponses([
			(context) => {
				toolNames = context.tools?.map((tool) => tool.name) ?? [];
				systemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("Web research complete.");
			},
		]);
		const externalTools: AgentTool[] = ["web_search", "fetch_content", "get_search_content"].map((name) => ({
			name,
			label: name,
			description: `${name} test tool`,
			parameters: Type.Object({}),
			execute: async () => ({ content: [{ type: "text", text: "ok" }], details: undefined }),
		}));

		const result = await runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: worker({
				id: "research",
				displayName: "Mayuri",
				tools: ["web_search", "fetch_content", "get_search_content"],
			}),
			externalTools,
			task: "Research an external technical source.",
		});

		expect(result.status).toBe("completed");
		expect(toolNames).toEqual(["web_search", "fetch_content", "get_search_content"]);
		expect(systemPrompt).toContain("Local workspace access is unavailable");
		expect(systemPrompt).not.toContain(`Workspace: ${process.cwd()}`);
	});

	it("clips oversized worker output before returning it to the parent", async () => {
		const { registration, models } = createFaux();
		registration.setResponses([() => fauxAssistantMessage("x".repeat(500))]);

		const result = await runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: worker(),
			task: "Return a deliberately long result.",
			maxResultCharacters: 100,
		});

		expect(result.status).toBe("completed");
		expect(result.truncated).toBe(true);
		expect(result.output.length).toBeLessThanOrEqual(100);
		expect(result.output).toContain("delegated result truncated");
	});

	it("propagates parent cancellation to the child harness", async () => {
		const { registration, models } = createFaux();
		let release = () => {};
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		registration.setResponses([
			async () => {
				await blocked;
				return fauxAssistantMessage("late result");
			},
		]);
		const controller = new AbortController();

		const running = runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: worker(),
			task: "Wait until cancelled.",
			signal: controller.signal,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		release();

		const result = await running;
		expect(result.status).toBe("cancelled");
		expect(result.output).toBe("");
	});

	it("injects canonical ids and aliases plus explicit-worker precedence", () => {
		const { registration, models } = createFaux();
		const delegate = createDelegateTool({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			workers: RECODE_NAMED_WORKERS,
		});
		const workerSchema = (
			delegate.parameters as unknown as {
				properties: { worker: { enum?: string[]; description?: string } };
			}
		).properties.worker;

		expect(workerSchema.enum).toEqual([
			"research",
			"Mayuri",
			"研究",
			"Mayuri (研究)",
			"audit",
			"Levi",
			"監査",
			"Levi (監査)",
			"shiori",
			"Shiori",
			"栞",
			"Shiori (栞)",
		]);
		expect(workerSchema.description).toContain("Mayuri (研究) -> research");
		expect(workerSchema.description).toContain("Levi (監査) -> audit");
		expect(workerSchema.description).toContain("Shiori (栞) -> shiori");
		expect(delegate.description).toContain("explicitly requests a worker");
		expect(delegate.description).toContain("simple read/grep/find/ls task");
		expect(delegate.description).toContain("do not replace the worker");
		expect(delegate.description).toContain("id=research; name=Mayuri");
		expect(delegate.description).toContain("id=audit; name=Levi");
		expect(delegate.description).toContain("id=shiori; name=Shiori");
	});

	it("accepts display-name aliases but returns the canonical worker id", async () => {
		const { registration, models } = createFaux();
		registration.setResponses([
			() => fauxAssistantMessage("Levi result."),
			() => fauxAssistantMessage("Mayuri result."),
		]);
		const delegate = createDelegateTool({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			workers: [worker({ id: "research", displayName: "Mayuri" }), worker({ id: "audit", displayName: "Levi" })],
		});

		const levi = await delegate.execute("call-levi", { worker: "Levi", task: "Audit the boundary." });
		const mayuri = await delegate.execute("call-mayuri", { worker: "mAyUrI", task: "Research the boundary." });

		expect(levi.details.result.workerId).toBe("audit");
		expect(levi.details.result.workerName).toBe("Levi");
		expect(mayuri.details.result.workerId).toBe("research");
		expect(mayuri.details.result.workerName).toBe("Mayuri");
	});

	it("exposes one parallel-safe parent-facing delegate tool", async () => {
		const { registration, models } = createFaux();
		registration.setResponses([() => fauxAssistantMessage("Reviewed the requested boundary.")]);
		const delegate = createDelegateTool({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			workers: [worker()],
		});

		expect(delegate.executionMode).toBe("parallel");
		const toolResult = await delegate.execute("call-1", {
			worker: "reviewer",
			task: "Review the boundary.",
		});

		expect(toolResult.details.result.status).toBe("completed");
		expect(toolResult.details.result.workerName).toBe("Reviewer");
		expect(toolResult.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining("Reviewed the requested boundary"),
		});
	});

	it("rejects unsupported tools so a child cannot receive delegate", async () => {
		const { registration, models } = createFaux();

		await expect(
			runNamedWorker({
				cwd: process.cwd(),
				model: registration.getModel(),
				models,
				worker: worker({ tools: ["delegate" as never] }),
				task: "Attempt nested delegation.",
			}),
		).rejects.toThrow("Unsupported delegated worker tool: delegate");
	});
});
