import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool } from "@reitaard/recode-agent-core";
import { createModels, fauxAssistantMessage, fauxProvider } from "@reitaard/recode-ai";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import type { NamedWorkerDefinition } from "../src/core/delegation/named-worker.ts";
import { WorkerChatController } from "../src/core/delegation/worker-chat.ts";
import {
	resolveWorkerGitPath,
	type WorkerConversationTurnResult,
	WorkerDirectory,
} from "../src/core/delegation/worker-directory.ts";
import { createWorkerControlTools } from "../src/core/delegation/worker-tools.ts";

let providerCount = 0;

function createFaux() {
	const registration = fauxProvider({ provider: `worker-directory-test-${++providerCount}` });
	const models = createModels();
	models.setProvider(registration.provider);
	return { registration, models };
}

function workers(): NamedWorkerDefinition[] {
	return [
		{
			id: "research",
			displayName: "Mayuri",
			aliases: ["研究"],
			description: "Researches authoritative sources.",
			personality: "Curious and meticulous.",
		},
		{
			id: "audit",
			displayName: "Levi",
			aliases: ["監査"],
			description: "Audits concrete risks.",
			personality: "Blunt and disciplined.",
		},
	];
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

describe("WorkerDirectory", () => {
	it("is a reusable source of worker identity, aliases, capability, and personality", async () => {
		const { registration, models } = createFaux();
		let oneShotPrompt = "";
		registration.setResponses([
			(context) => {
				oneShotPrompt = messageText(context.messages);
				return fauxAssistantMessage("Audit complete.");
			},
		]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
		});

		expect(directory.listWorkers()).toMatchObject([
			{ id: "research", displayName: "Mayuri", aliases: ["研究"], personality: "Curious and meticulous." },
			{ id: "audit", displayName: "Levi", aliases: ["監査"], personality: "Blunt and disciplined." },
		]);
		const result = await directory.runOneShot("監査", "Audit this boundary.");
		expect(result.status).toBe("completed");
		expect(result.workerId).toBe("audit");
		expect(result.workerAliases).toEqual(["監査"]);
		expect(oneShotPrompt).toContain("id=aizen; name=Aizen (藍染); kind=agent; role=primary-agent");
	});

	it("shares read-only Kioku search with every worker and enforces stale-memory policy", async () => {
		const { registration, models } = createFaux();
		let toolNames: string[] = [];
		let systemPrompt = "";
		registration.setResponses([
			(context) => {
				toolNames = context.tools?.map((tool) => tool.name) ?? [];
				systemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("Memory checked.");
			},
		]);
		const memoryTool: AgentTool = {
			name: "kioku_search",
			label: "Kioku Search",
			description: "Search shared read-only durable memory.",
			parameters: Type.Object({ query: Type.String() }),
			execute: async () => ({ content: [{ type: "text", text: "No matching memory." }], details: undefined }),
		};
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
			getExternalTools: () => [memoryTool],
		});

		expect(directory.listWorkers().every((worker) => worker.tools.includes("kioku_search"))).toBe(true);
		const result = await directory.runOneShot("Levi", "Check durable context when relevant.");
		expect(result.status).toBe("completed");
		expect(toolNames).toContain("kioku_search");
		expect(systemPrompt).toContain("Use kioku_search only when durable memory is relevant");
		expect(systemPrompt).toContain("potentially stale evidence");
		expect(systemPrompt).toContain("never authorizes a memory write");
	});

	it("keeps bounded Aizen/worker dialogue so a named worker can be addressed again", async () => {
		const { registration, models } = createFaux();
		let secondTurnPrompt = "";
		registration.setResponses([
			() => fauxAssistantMessage("I found the first source."),
			(context) => {
				secondTurnPrompt = messageText(context.messages);
				return fauxAssistantMessage("I remember the first source.");
			},
		]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
		});

		const first = await directory.startConversation("Mayuri", "Find the first source.");
		const second = await directory.messageConversation(first.conversation.conversationId, "What did you find?");

		expect(first.result.status).toBe("completed");
		expect(second.result.status).toBe("completed");
		expect(second.conversation.workerId).toBe("research");
		expect(second.conversation.turnCount).toBe(2);
		expect(secondTurnPrompt).toContain("PERSISTENT WORKER CONVERSATION");
		expect(secondTurnPrompt).toContain("id=aizen; name=Aizen (藍染); kind=agent; role=primary-agent");
		expect(secondTurnPrompt).toContain("Aizen (藍染): Find the first source.");
		expect(secondTurnPrompt).toContain("Find the first source.");
		expect(secondTurnPrompt).toContain("I found the first source.");
	});

	it("keeps a direct-chat code word inside that session and applies worker runtime settings", async () => {
		const { registration, models } = createFaux();
		let firstTurnPrompt = "";
		let followUpPrompt = "";
		registration.setResponses([
			(context) => {
				firstTurnPrompt = messageText(context.messages);
				return fauxAssistantMessage("I will remember bluebird.");
			},
			(context) => {
				followUpPrompt = messageText(context.messages);
				return fauxAssistantMessage("The code word is bluebird.");
			},
		]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
		});

		directory.setWorkerSettings("監査", { thinkingLevel: "high", maxOutputTokens: 4096 });
		const chat = new WorkerChatController(directory);
		await chat.send("Levi", "Remember the code word bluebird.");
		const reply = await chat.send("監査", "What was the code word?");

		expect(followUpPrompt).toContain("Remember the code word bluebird.");
		expect(followUpPrompt).toContain("I will remember bluebird.");
		expect(firstTurnPrompt).toContain("id=creator; name=Creator; kind=human; role=creator");
		expect(followUpPrompt).toContain("Creator: Remember the code word bluebird.");
		expect(followUpPrompt).not.toContain("Caller:");
		expect(reply.result.output).toBe("The code word is bluebird.");
		expect(reply.conversation.speaker).toMatchObject({ id: "creator", kind: "human", role: "creator" });
		expect(directory.getWorkerSettings("Levi")).toMatchObject({
			thinkingLevel: "high",
			maxOutputTokens: 4096,
		});
		expect(directory.listWorkers().find((worker) => worker.id === "audit")).toMatchObject({
			thinkingLevel: "high",
			maxOutputTokens: 4096,
		});
	});

	it("supports a direct named-worker chat while the host keeps the conversation id private", async () => {
		const { registration, models } = createFaux();
		registration.setResponses([
			() => fauxAssistantMessage("Levi is ready."),
			() => fauxAssistantMessage("The audit handoff is complete."),
		]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
		});

		const chat = new WorkerChatController(directory);
		const opened = await chat.send("監査", "Open a direct audit chat.");
		const conversationId = chat.getConversationId("Levi");
		const reply = await chat.send("audit", "Present the handoff to Aizen.");

		expect(conversationId).toBe(opened.conversation.conversationId);
		expect(reply.conversation.workerName).toBe("Levi");
		expect(reply.conversation.conversationId).toBe(conversationId);
		expect(reply.conversation.turnCount).toBe(2);
		expect(reply.result.output).toBe("The audit handoff is complete.");
		expect(chat.close("Levi (監査)")).toBe(true);
		expect(directory.getStatus()).toHaveLength(0);
	});

	it("cancels an active initial direct chat without losing its private controller", async () => {
		const { registration, models } = createFaux();
		let releaseWorker = () => {};
		const blockedWorker = new Promise<void>((resolve) => {
			releaseWorker = resolve;
		});
		registration.setResponses([
			async () => {
				await blockedWorker;
				return fauxAssistantMessage("Late direct-chat result.");
			},
		]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
		});
		const chat = new WorkerChatController(directory);
		const pending = chat.send("Levi", "Start a long direct chat turn.");

		await vi.waitFor(() => expect(directory.getStatus()[0]?.status).toBe("running"));
		expect(chat.cancel("監査")).toBe(true);
		releaseWorker();

		const turn = await pending;
		expect(turn.result.status).toBe("cancelled");
		expect(chat.getConversationId("Levi")).toBe(turn.conversation.conversationId);
		expect(chat.close("Levi")).toBe(true);
	});

	it("restores a bounded direct chat into a new runtime", async () => {
		const firstRuntime = createFaux();
		firstRuntime.registration.setResponses([() => fauxAssistantMessage("I will remember bluebird.")]);
		const firstDirectory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: firstRuntime.registration.getModel(),
			models: firstRuntime.models,
		});
		const firstChat = new WorkerChatController(firstDirectory);
		const first = await firstChat.send("Levi", "Remember bluebird.");

		const resumedRuntime = createFaux();
		let resumedPrompt = "";
		resumedRuntime.registration.setResponses([
			(context) => {
				resumedPrompt = messageText(context.messages);
				return fauxAssistantMessage("bluebird");
			},
		]);
		const resumedDirectory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: resumedRuntime.registration.getModel(),
			models: resumedRuntime.models,
		});
		resumedDirectory.restoreConversationTurn({
			conversationId: first.conversation.conversationId,
			workerId: first.conversation.workerId,
			speaker: first.conversation.speaker,
			message: "Remember bluebird.",
			result: first.result,
			createdAt: first.conversation.createdAt,
			updatedAt: first.conversation.updatedAt,
			turnCount: first.conversation.turnCount,
		});
		const resumedChat = new WorkerChatController(resumedDirectory);
		resumedChat.restore("監査", first.conversation.conversationId);
		const reply = await resumedChat.send("Levi", "What did I ask you to remember?");

		expect(reply.conversation.turnCount).toBe(2);
		expect(reply.result.output).toBe("bluebird");
		expect(resumedPrompt).toContain("Creator: Remember bluebird.");
		expect(resumedPrompt).toContain("Levi: I will remember bluebird.");
	});

	it("exposes running status and supports cancellation from another caller", async () => {
		const { registration, models } = createFaux();
		let release = () => {};
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		registration.setResponses([
			async () => {
				await blocked;
				return fauxAssistantMessage("Late result.");
			},
		]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
		});

		const running = directory.startConversation("audit", "Wait for cancellation.");
		await new Promise((resolve) => setTimeout(resolve, 0));
		const [active] = directory.getStatus();
		expect(active.status).toBe("running");
		expect(directory.cancelConversation(active.conversationId)).toBe(true);
		release();

		const finished = await running;
		expect(finished.result.status).toBe("cancelled");
		expect(directory.getStatus(active.conversationId)[0].status).toBe("cancelled");
	});

	it("returns a typed failed turn and never leaves a conversation stuck running", async () => {
		const { models } = createFaux();
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			getModel: () => undefined,
			models,
		});

		const turn = await directory.startConversation("Mayuri", "Try without an active model.");
		expect(turn.result.status).toBe("failed");
		expect(turn.result.error).toContain("without an active model");
		expect(turn.conversation.status).toBe("failed");
		expect(directory.getStatus(turn.conversation.conversationId)[0].status).toBe("failed");
	});

	it("allows explicit sibling worktrees but rejects unrelated workspaces", () => {
		const parent = mkdtempSync(join(tmpdir(), "recode-worker-worktrees-"));
		const main = join(parent, "main");
		const sibling = join(parent, "sibling");
		const unrelated = join(parent, "unrelated");
		mkdirSync(main);
		mkdirSync(unrelated);
		const runGit = (workspace: string, ...args: string[]) =>
			execFileSync("git", ["-C", workspace, ...args], { encoding: "utf8" }).trim();
		try {
			runGit(main, "init");
			runGit(main, "config", "user.email", "recode-worker@example.invalid");
			runGit(main, "config", "user.name", "Recode Worker");
			writeFileSync(join(main, "tracked.txt"), "main\n");
			runGit(main, "add", "tracked.txt");
			runGit(main, "commit", "-m", "main");
			runGit(main, "worktree", "add", sibling, "-b", "worker-sibling");
			runGit(unrelated, "init");

			const { registration, models } = createFaux();
			const directory = new WorkerDirectory({
				cwd: main,
				workers: workers(),
				model: registration.getModel(),
				models,
			});

			expect(directory.resolveWorkspace(sibling)).toBe(realpathSync(sibling));
			if (process.platform === "win32") {
				const toMsysPath = (path: string) =>
					path.replaceAll("\\", "/").replace(/^([a-zA-Z]):/, (_match, drive: string) => `/${drive.toLowerCase()}`);
				const msysSibling = toMsysPath(sibling);
				const commonDirectory = runGit(main, "rev-parse", "--path-format=absolute", "--git-common-dir");
				expect(directory.resolveWorkspace(msysSibling)).toBe(realpathSync(sibling));
				expect(resolveWorkerGitPath(sibling, toMsysPath(commonDirectory))).toBe(realpathSync(commonDirectory));
			}
			expect(() => directory.resolveWorkspace(unrelated)).toThrow("another worktree of the same Git repository");
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	it("launches multiple conversations for the same worker concurrently", async () => {
		const { registration, models } = createFaux();
		let release = () => {};
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		registration.setResponses([
			async () => {
				await blocked;
				return fauxAssistantMessage("First audit complete.");
			},
			async () => {
				await blocked;
				return fauxAssistantMessage("Second audit complete.");
			},
		]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
		});
		const startMany = createWorkerControlTools(directory).find((tool) => tool.name === "worker_start_many");
		if (!startMany) throw new Error("worker_start_many tool missing");

		const running = startMany.execute("start-many", {
			requests: [
				{ worker: "Levi", message: "Audit boundary one." },
				{ worker: "Levi", message: "Audit boundary two." },
			],
		});
		await vi.waitFor(() =>
			expect(directory.getStatus().filter((entry) => entry.status === "running")).toHaveLength(2),
		);
		release();
		const response = await running;

		expect(response.details.turns).toHaveLength(2);
		const turns = response.details.turns as WorkerConversationTurnResult[];
		expect(new Set(turns.map((turn) => turn.conversation.conversationId)).size).toBe(2);
		expect(turns.every((turn) => turn.result.workerId === "audit")).toBe(true);
	});

	it("counts one-shot delegates against shared global and per-worker concurrency", async () => {
		const { registration, models } = createFaux();
		let release = () => {};
		let markStarted = () => {};
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const blockedResponse = async () => {
			markStarted();
			await blocked;
			return fauxAssistantMessage("Worker complete.");
		};
		registration.setResponses([blockedResponse, blockedResponse]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
			maxActiveConversations: 2,
			maxActiveConversationsPerWorker: 1,
		});

		const delegate = directory.runOneShot("audit", "Audit independently.");
		await started;
		await expect(directory.startConversation("audit", "Audit concurrently.")).rejects.toThrow(
			"Worker concurrency limit reached for audit (1)",
		);
		const research = directory.startConversation("research", "Research concurrently.");
		await vi.waitFor(() => expect(directory.getStatus()[0]?.status).toBe("running"));
		await expect(directory.startConversation("audit", "Exceed the global limit.")).rejects.toThrow(
			"Worker conversation concurrency limit reached (2)",
		);
		directory.closeAll();
		release();
		await expect(Promise.all([delegate, research])).resolves.toHaveLength(2);
		expect(await delegate).toMatchObject({ status: "cancelled" });
	});

	it("rejects over-capacity batches atomically before launching any worker", async () => {
		const { registration, models } = createFaux();
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
			maxActiveConversations: 1,
		});
		const startMany = createWorkerControlTools(directory).find((tool) => tool.name === "worker_start_many");
		if (!startMany) throw new Error("worker_start_many tool missing");

		await expect(
			startMany.execute("over-capacity", {
				requests: [
					{ worker: "audit", message: "Audit one." },
					{ worker: "research", message: "Research one." },
				],
			}),
		).rejects.toThrow("Worker conversation concurrency limit reached (1)");
		expect(directory.getStatus()).toEqual([]);
	});

	it("preflights every batch message and workspace before launching any worker", async () => {
		const root = mkdtempSync(join(tmpdir(), "recode-worker-invalid-batch-"));
		const unrelated = join(root, "unrelated");
		mkdirSync(unrelated);
		const { registration, models } = createFaux();
		const response = vi.fn(() => fauxAssistantMessage("Should not run."));
		registration.setResponses([response, response]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
		});
		const startMany = createWorkerControlTools(directory).find((tool) => tool.name === "worker_start_many");
		if (!startMany) throw new Error("worker_start_many tool missing");

		try {
			await expect(
				startMany.execute("invalid-message", {
					requests: [
						{ worker: "audit", message: "Audit one." },
						{ worker: "research", message: "" },
					],
				}),
			).rejects.toThrow("Worker message is required");
			expect(directory.getStatus()).toEqual([]);

			await expect(
				startMany.execute("invalid-workspace", {
					requests: [
						{ worker: "audit", message: "Audit one." },
						{ worker: "research", message: "Research one.", workspace: unrelated },
					],
				}),
			).rejects.toThrow("another worktree of the same Git repository");
			expect(directory.getStatus()).toEqual([]);
			expect(response).not.toHaveBeenCalled();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("enforces equal global and per-worker active-conversation limits", async () => {
		const { registration, models } = createFaux();
		let release = () => {};
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		registration.setResponses([
			async () => {
				await blocked;
				return fauxAssistantMessage("First complete.");
			},
			async () => {
				await blocked;
				return fauxAssistantMessage("Second complete.");
			},
		]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
			maxActiveConversations: 2,
			maxActiveConversationsPerWorker: 1,
		});

		const first = directory.startConversation("audit", "First audit.");
		await vi.waitFor(() =>
			expect(directory.getStatus().filter((entry) => entry.status === "running")).toHaveLength(1),
		);
		await expect(directory.startConversation("audit", "Second audit.")).rejects.toThrow(
			"Worker concurrency limit reached for audit (1)",
		);
		const second = directory.startConversation("research", "First research.");
		await vi.waitFor(() =>
			expect(directory.getStatus().filter((entry) => entry.status === "running")).toHaveLength(2),
		);
		await expect(directory.startConversation("research", "Second research.")).rejects.toThrow(
			"Worker conversation concurrency limit reached (2)",
		);
		release();
		await expect(Promise.all([first, second])).resolves.toHaveLength(2);
	});

	it("mounts deterministic controls and exposes the full conversation id to the model", async () => {
		const { registration, models } = createFaux();
		registration.setResponses([() => fauxAssistantMessage("Conversation started.")]);
		const directory = new WorkerDirectory({
			cwd: process.cwd(),
			workers: workers(),
			model: registration.getModel(),
			models,
		});
		const tools = createWorkerControlTools(directory);

		expect(tools.map((tool) => tool.name)).toEqual([
			"worker_list",
			"worker_start",
			"worker_start_many",
			"worker_message",
			"worker_status",
			"worker_cancel",
			"worker_close",
		]);
		expect(tools.every((tool) => tool.executionMode === "parallel")).toBe(true);

		const start = tools.find((tool) => tool.name === "worker_start");
		if (!start) throw new Error("worker_start tool missing");
		const response = await start.execute("start-1", { worker: "Mayuri", message: "Start a conversation." });
		const fullId = response.details.conversation.conversationId;
		const text = response.content.find((item) => item.type === "text")?.text ?? "";
		expect(fullId).toMatch(/^[0-9a-f-]{36}$/);
		expect(text).toContain(`conversationId: ${fullId}`);
	});
});
