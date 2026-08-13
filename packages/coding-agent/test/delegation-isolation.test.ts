import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createModels,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	type RegisterFauxProviderOptions,
} from "@reitaard/recode-ai";
import { describe, expect, it } from "vitest";
import { type NamedWorkerDefinition, runNamedWorker } from "../src/core/delegation/named-worker.ts";
import { createWorkspaceToolCallGuard } from "../src/core/delegation/workspace-guard.ts";

let providerCount = 0;

function createFaux(options: RegisterFauxProviderOptions = {}) {
	const registration = fauxProvider({ provider: `delegation-isolation-${++providerCount}`, ...options });
	const models = createModels();
	models.setProvider(registration.provider);
	return { registration, models };
}

function worker(overrides: Partial<NamedWorkerDefinition> = {}): NamedWorkerDefinition {
	return {
		id: "audit",
		displayName: "Levi",
		description: "Audits one requested boundary.",
		...overrides,
	};
}

function contextText(messages: Array<{ role: string; content: unknown }>): string {
	return messages
		.flatMap((message) => {
			if (typeof message.content === "string") return [message.content];
			if (!Array.isArray(message.content)) return [];
			return message.content.flatMap((part) => {
				if (!part || typeof part !== "object" || !("type" in part)) return [];
				if (part.type === "text" && "text" in part) return [String(part.text)];
				return [];
			});
		})
		.join("\n");
}

describe("delegated worker isolation", () => {
	it("creates a fresh transcript for every worker run", async () => {
		const { registration, models } = createFaux();
		const contexts: string[] = [];
		registration.setResponses([
			(context) => {
				contexts.push(contextText(context.messages));
				return fauxAssistantMessage("FIRST_RESULT_SECRET");
			},
			(context) => {
				contexts.push(contextText(context.messages));
				return fauxAssistantMessage("second result");
			},
		]);

		const first = await runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: worker(),
			task: "FIRST_TASK_SECRET",
		});
		const second = await runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: worker(),
			task: "SECOND_TASK",
		});

		expect(first.runId).not.toBe(second.runId);
		expect(contexts[0]).toContain("FIRST_TASK_SECRET");
		expect(contexts[1]).toContain("SECOND_TASK");
		expect(contexts[1]).not.toContain("FIRST_TASK_SECRET");
		expect(contexts[1]).not.toContain("FIRST_RESULT_SECRET");
	});

	it("receives only the task and explicitly supplied parent context", async () => {
		const { registration, models } = createFaux();
		let visible = "";
		registration.setResponses([
			(context) => {
				visible = contextText(context.messages);
				return fauxAssistantMessage("done");
			},
		]);

		await runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: worker(),
			task: "Inspect the requested boundary.",
			context: "EXPLICIT_PARENT_CONTEXT",
		});

		expect(visible).toContain("Inspect the requested boundary.");
		expect(visible).toContain("EXPLICIT_PARENT_CONTEXT");
		expect(visible).not.toContain("AIZEN_PRIVATE_TRANSCRIPT");
	});

	it("does not load any skills into Levi even when the host has skills", async () => {
		const { registration, models } = createFaux();
		const dir = await mkdtemp(join(tmpdir(), "repi-worker-skills-"));
		const librarianPath = join(dir, "librarian.md");
		const privatePath = join(dir, "private.md");
		await writeFile(librarianPath, "LIBRARIAN_SKILL_SECRET", "utf8");
		await writeFile(privatePath, "UNSELECTED_SKILL_SECRET", "utf8");
		let visible = "";
		registration.setResponses([
			(context) => {
				visible = contextText(context.messages);
				return fauxAssistantMessage("done");
			},
		]);

		try {
			await runNamedWorker({
				cwd: process.cwd(),
				model: registration.getModel(),
				models,
				worker: worker(),
				skills: [
					{ name: "librarian", description: "Research.", filePath: librarianPath },
					{ name: "private", description: "Private.", filePath: privatePath },
				],
				task: "Audit without research skills.",
			});
			expect(visible).not.toContain("LIBRARIAN_SKILL_SECRET");
			expect(visible).not.toContain("UNSELECTED_SKILL_SECRET");
			expect(visible).not.toContain("<skill");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("loads only Mayuri's selected librarian skill", async () => {
		const { registration, models } = createFaux();
		const dir = await mkdtemp(join(tmpdir(), "repi-mayuri-skills-"));
		const librarianPath = join(dir, "librarian.md");
		const privatePath = join(dir, "private.md");
		await writeFile(librarianPath, "LIBRARIAN_SELECTED_CONTENT", "utf8");
		await writeFile(privatePath, "UNSELECTED_SKILL_SECRET", "utf8");
		let visible = "";
		registration.setResponses([
			(context) => {
				visible = contextText(context.messages);
				return fauxAssistantMessage("done");
			},
		]);

		try {
			await runNamedWorker({
				cwd: process.cwd(),
				model: registration.getModel(),
				models,
				worker: worker({ id: "research", displayName: "Mayuri", skillName: "librarian" }),
				skills: [
					{ name: "librarian", description: "Research.", filePath: librarianPath },
					{ name: "private", description: "Private.", filePath: privatePath },
				],
				task: "Research one source.",
			});
			expect(visible).toContain("LIBRARIAN_SELECTED_CONTENT");
			expect(visible).not.toContain("UNSELECTED_SKILL_SECRET");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("returns only the final worker answer, not the child tool transcript", async () => {
		const { registration, models } = createFaux();
		const dir = await mkdtemp(join(tmpdir(), "repi-worker-output-"));
		await writeFile(join(dir, "secret.txt"), "CHILD_TOOL_TRANSCRIPT_SECRET", "utf8");
		registration.setResponses([
			fauxAssistantMessage(fauxToolCall("read", { path: "secret.txt" }, { id: "read-secret" })),
			() => fauxAssistantMessage("Safe final summary."),
		]);

		try {
			const result = await runNamedWorker({
				cwd: dir,
				model: registration.getModel(),
				models,
				worker: worker(),
				task: "Read the file and summarize it without quoting it.",
			});
			expect(result.status).toBe("completed");
			expect(result.output).toBe("Safe final summary.");
			expect(result.output).not.toContain("CHILD_TOOL_TRANSCRIPT_SECRET");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("reports harness setup separately from total worker duration", async () => {
		const { registration, models } = createFaux();
		registration.setResponses([() => fauxAssistantMessage("Measured result.")]);

		const result = await runNamedWorker({
			cwd: process.cwd(),
			model: registration.getModel(),
			models,
			worker: worker(),
			task: "Measure the local setup boundary.",
		});

		expect(result.harnessSetupDurationMs).toBeGreaterThanOrEqual(0);
		expect(result.harnessSetupDurationMs).toBeLessThanOrEqual(result.durationMs);
	});

	it("blocks parent traversal before a worker can read outside cwd", async () => {
		const { registration, models } = createFaux();
		const root = await mkdtemp(join(tmpdir(), "repi-worker-boundary-"));
		const workspace = join(root, "workspace");
		await mkdir(workspace);
		await writeFile(join(root, "outside.txt"), "OUTSIDE_WORKSPACE_SECRET", "utf8");
		let visibleAfterTool = "";
		registration.setResponses([
			fauxAssistantMessage(fauxToolCall("read", { path: "../outside.txt" }, { id: "read-outside" })),
			(context) => {
				visibleAfterTool = contextText(context.messages);
				return fauxAssistantMessage("The outside read was blocked.");
			},
		]);

		try {
			const result = await runNamedWorker({
				cwd: workspace,
				model: registration.getModel(),
				models,
				worker: worker(),
				task: "Try to inspect the parent file.",
			});
			expect(result.status).toBe("completed");
			expect(visibleAfterTool).toContain("only access paths inside the active workspace");
			expect(visibleAfterTool).not.toContain("OUTSIDE_WORKSPACE_SECRET");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("blocks absolute outside paths and existing symlink escapes", async () => {
		const root = await mkdtemp(join(tmpdir(), "repi-worker-guard-"));
		const workspace = join(root, "workspace");
		const outsidePath = join(root, "outside.txt");
		await mkdir(workspace);
		await writeFile(outsidePath, "outside", "utf8");
		const guard = createWorkspaceToolCallGuard(workspace);

		try {
			await expect(guard({ toolName: "read", input: { path: outsidePath } })).resolves.toMatchObject({
				block: true,
			});

			const linkPath = join(workspace, "escape.txt");
			try {
				await symlink(outsidePath, linkPath, "file");
			} catch (error: unknown) {
				const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
				if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP") return;
				throw error;
			}
			await expect(guard({ toolName: "read", input: { path: "escape.txt" } })).resolves.toMatchObject({
				block: true,
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
