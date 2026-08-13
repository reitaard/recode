import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	RecodeGateway,
	type RecodeGatewayDelivery,
	type RecodeGatewayInboundMessage,
	type RecodeGatewayRuntime,
} from "../src/core/recode-gateway.ts";
import { RecodeGatewayStore } from "../src/core/recode-gateway-store.ts";
import {
	normalizeTelegramText,
	parseTelegramConversationId,
	renderTelegramHtml,
	telegramConversationId,
	telegramTopicSessionsDirectory,
	telegramTopicWorkspaceDirectory,
} from "../src/recode-telegram-gateway.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function inbound(conversationId: string, text: string): RecodeGatewayInboundMessage {
	return { channel: "telegram", conversationId, messageId: text, text };
}

function delivery(log: string[]): RecodeGatewayDelivery {
	return {
		begin: async () => {
			log.push("begin");
		},
		progress: async (text) => {
			log.push(`progress:${text}`);
		},
		update: async (text) => {
			log.push(`update:${text}`);
		},
		complete: async (text) => {
			log.push(`complete:${text}`);
		},
		fail: async (message) => {
			log.push(`fail:${message}`);
		},
	};
}

describe("RecodeGateway", () => {
	it("keeps Telegram group topics isolated and normalizes addressed commands", () => {
		expect(telegramConversationId(-100123, 42)).toBe("-100123:topic:42");
		expect(parseTelegramConversationId("-100123:topic:42")).toEqual({ chatId: -100123, threadId: 42 });
		expect(normalizeTelegramText("/new@recode_bot", "recode_bot")).toBe("/new");
		expect(normalizeTelegramText("@recode_bot inspect this", "recode_bot")).toBe("inspect this");
	});

	it("uses stable topic identifiers for topic session directories", () => {
		expect(telegramTopicSessionsDirectory("/root/telegram", -100123, 42)).toBe(
			join(resolve("/root/telegram"), "Topics", "sessions", "-100123-42"),
		);
		expect(telegramTopicWorkspaceDirectory("/root/telegram", -100123, 42)).toBe(
			join(resolve("/root/telegram"), "Topics", "workspaces", "-100123-42"),
		);
	});

	it("renders common Markdown as Telegram HTML with monospace code", () => {
		expect(
			renderTelegramHtml(
				"## Status\n- **CPU:** `6.07%`\n- [Dashboard](https://example.test/?a=1&b=2)\n\n```sh\ndocker ps\n```",
			),
		).toBe(
			'<b>Status</b>\n• <b>CPU:</b> <code>6.07%</code>\n• <a href="https://example.test/?a=1&amp;b=2">Dashboard</a>\n\n<pre><code class="language-sh">docker ps</code></pre>',
		);
	});

	it("escapes raw HTML and closes incomplete code fences for Telegram", () => {
		expect(renderTelegramHtml("<unsafe> & `value`\n```\nconst x = 1;")).toBe(
			"&lt;unsafe&gt; &amp; <code>value</code>\n<pre><code>const x = 1;</code></pre>",
		);
	});

	it("persists routes and accepted jobs while deduplicating Telegram updates", async () => {
		const root = await mkdtemp(join(tmpdir(), "recode-gateway-"));
		temporaryRoots.push(root);
		const store = new RecodeGatewayStore(join(root, "gateway.sqlite"));
		store.open();
		const message = inbound("-100:topic:7", "inspect this");

		store.setSessionId("telegram:-100:topic:7", "topic-session");
		expect(store.getSessionId("telegram:-100:topic:7")).toBe("topic-session");
		expect(store.isTopicConnected("telegram:-100:topic:7")).toBe(false);
		store.connectTopic("telegram:-100:topic:7");
		expect(store.isTopicConnected("telegram:-100:topic:7")).toBe(true);
		store.disconnectTopic("telegram:-100:topic:7");
		expect(store.isTopicConnected("telegram:-100:topic:7")).toBe(false);
		const accepted = store.accept(message);
		expect(accepted?.status).toBe("accepted");
		expect(store.accept(message)).toBeUndefined();
		store.setJobStatus(accepted?.id ?? "", "running");
		expect(store.recoverAccepted()).toEqual([]);
		expect(store.counts().interrupted).toBe(1);

		const recoverable = inbound("-100:topic:8", "second topic");
		store.accept(recoverable);
		store.close();
		const reopened = new RecodeGatewayStore(join(root, "gateway.sqlite"));
		reopened.open();
		expect(reopened.recoverAccepted()[0]?.message).toEqual(recoverable);
		reopened.close();
	});

	it("routes sequential turns through one persistent conversation runtime", async () => {
		const sessions = new Map<string, string>();
		const runs: string[] = [];
		const deliveries: string[] = [];
		const runtime: RecodeGatewayRuntime = {
			run: async (prompt, onText) => {
				runs.push(prompt);
				onText(`answer:${prompt}`);
			},
			abort: vi.fn(async () => undefined),
			close: vi.fn(async () => undefined),
		};
		const createRuntime = vi.fn(async () => runtime);
		const gateway = new RecodeGateway({
			sessions: {
				getSessionId: (route) => sessions.get(route),
				setSessionId: (route, sessionId) => sessions.set(route, sessionId),
			},
			createSessionId: ({ conversationId }) => `session-${conversationId}`,
			createRuntime,
		});

		gateway.submit(inbound("42", "first"), delivery(deliveries));
		gateway.submit(inbound("42", "second"), delivery(deliveries));

		await vi.waitFor(() => expect(gateway.getStatus()).toMatchObject({ running: false, queued: 0 }));
		expect(runs).toEqual(["first", "second"]);
		expect(createRuntime).toHaveBeenCalledTimes(1);
		expect(createRuntime).toHaveBeenCalledWith("telegram:42", "session-42");
		expect(deliveries).toContain("complete:answer:first");
		expect(deliveries).toContain("complete:answer:second");
	});

	it("resets idle routes and aborts active work without replaying queued turns", async () => {
		const sessions = new Map<string, string>();
		let releaseRun: (() => void) | undefined;
		const runtime: RecodeGatewayRuntime = {
			run: () =>
				new Promise<void>((resolve) => {
					releaseRun = resolve;
				}),
			abort: vi.fn(async () => releaseRun?.()),
			close: vi.fn(async () => undefined),
		};
		let sequence = 0;
		const gateway = new RecodeGateway({
			sessions: {
				getSessionId: (route) => sessions.get(route),
				setSessionId: (route, sessionId) => sessions.set(route, sessionId),
			},
			createSessionId: () => `session-${++sequence}`,
			createRuntime: async () => runtime,
		});
		const message = inbound("7", "slow");

		gateway.submit(message, delivery([]));
		await vi.waitFor(() => expect(gateway.getStatus().running).toBe(true));
		gateway.submit(inbound("7", "queued"), delivery([]));
		await gateway.abort();
		await vi.waitFor(() => expect(gateway.getStatus()).toMatchObject({ running: false, queued: 0 }));
		expect(runtime.abort).toHaveBeenCalledOnce();

		expect(await gateway.reset(message)).toBe(true);
		expect(runtime.close).toHaveBeenCalledOnce();
		expect(sessions.get("telegram:7")).toBe("session-2");

		expect(await gateway.reload(message)).toBe(true);
		expect(sessions.get("telegram:7")).toBe("session-2");
	});
});
