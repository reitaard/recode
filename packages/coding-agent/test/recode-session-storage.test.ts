import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Session } from "@reitaard/recode-agent-core";
import type { AssistantMessage, UserMessage } from "@reitaard/recode-ai";
import { afterEach, describe, expect, test } from "vitest";
import { RecodeSessionStorage } from "../src/core/recode-session-storage.ts";
import { SessionManager } from "../src/core/session-manager.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("RecodeSessionStorage", () => {
	test("preserves AgentRuntime entries and active tool state", async () => {
		const manager = SessionManager.inMemory(process.cwd(), { id: "aizen-runtime" });
		const session = new Session(new RecodeSessionStorage(manager));
		const user: UserMessage = { role: "user", content: "inspect", timestamp: 1 };

		const userId = await session.appendMessage(user);
		await session.appendActiveToolsChange(["read", "bash"]);

		expect(manager.getEntry(userId)).toMatchObject({ type: "message", message: user });
		expect((await session.buildContext()).activeToolNames).toEqual(["read", "bash"]);
	});

	test("persists exact tree identity and leaf movement across reopen", async () => {
		const root = mkdtempSync(join(tmpdir(), "recode-session-storage-"));
		tempDirs.push(root);
		const manager = SessionManager.create(root, root, { id: "aizen-persisted" });
		const session = new Session(new RecodeSessionStorage(manager));
		const userId = await session.appendMessage({ role: "user", content: "first", timestamp: 1 });
		const assistant: AssistantMessage = {
			role: "assistant",
			content: [{ type: "text", text: "done" }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			stopReason: "stop",
			timestamp: 2,
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
		};
		const assistantId = await session.appendMessage(assistant);
		await session.moveTo(userId);

		const reopened = SessionManager.open(manager.getSessionFile()!);
		expect(reopened.getEntry(assistantId)).toMatchObject({ id: assistantId, parentId: userId });
		expect(reopened.getLeafId()).toBe(userId);
		expect(reopened.getEntries().at(-1)).toMatchObject({ type: "leaf", targetId: userId });
	});
});
