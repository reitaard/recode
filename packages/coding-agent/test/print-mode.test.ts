import type { AssistantMessage, ImageContent } from "@reitaard/recode-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { createAizenRuntime } from "../src/core/recode-aizen-runtime.ts";
import type { SessionShutdownEvent } from "../src/index.ts";
import { runPrintMode } from "../src/modes/print-mode.ts";

type EmitEvent = SessionShutdownEvent;

type FakeExtensionRunner = {
	hasHandlers: (eventType: string) => boolean;
	emit: ReturnType<typeof vi.fn<(event: EmitEvent) => Promise<void>>>;
};

type FakeSession = {
	sessionManager: { getHeader: () => object | undefined; getCwd: () => string };
	agent: { waitForIdle: () => Promise<void> };
	state: { messages: AssistantMessage[] };
	extensionRunner: FakeExtensionRunner;
	bindExtensions: ReturnType<typeof vi.fn>;
	subscribe: ReturnType<typeof vi.fn>;
	prompt: ReturnType<typeof vi.fn>;
	reload: ReturnType<typeof vi.fn>;
};

type FakeRuntimeHost = {
	session: FakeSession;
	newSession: ReturnType<typeof vi.fn>;
	fork: ReturnType<typeof vi.fn>;
	switchSession: ReturnType<typeof vi.fn>;
	dispose: ReturnType<typeof vi.fn>;
	setRebindSession: ReturnType<typeof vi.fn>;
};

function createAssistantMessage(options?: {
	text?: string;
	stopReason?: AssistantMessage["stopReason"];
	errorMessage?: string;
}): AssistantMessage {
	return {
		role: "assistant",
		content: options?.text ? [{ type: "text", text: options.text }] : [],
		api: "openai-responses",
		provider: "openai",
		model: "gpt-4o-mini",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: options?.stopReason ?? "stop",
		errorMessage: options?.errorMessage,
		timestamp: Date.now(),
	};
}

function createRuntimeHost(assistantMessage: AssistantMessage): FakeRuntimeHost {
	const extensionRunner: FakeExtensionRunner = {
		hasHandlers: (eventType: string) => eventType === "session_shutdown",
		emit: vi.fn(async () => {}),
	};

	const state = { messages: [assistantMessage] };

	const session: FakeSession = {
		sessionManager: { getHeader: () => undefined, getCwd: () => "/workspace" },
		agent: { waitForIdle: async () => {} },
		state,
		extensionRunner,
		bindExtensions: vi.fn(async () => {}),
		subscribe: vi.fn(() => () => {}),
		prompt: vi.fn(async () => {}),
		reload: vi.fn(async () => {}),
	};

	return {
		session,
		newSession: vi.fn(async () => undefined),
		fork: vi.fn(async () => ({ selectedText: "" })),
		switchSession: vi.fn(async () => undefined),
		dispose: vi.fn(async () => {
			await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
		}),
		setRebindSession: vi.fn(),
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("runPrintMode", () => {
	it("routes an opted-in text run through Aizen without binding legacy extensions", async () => {
		const runtimeHost = createRuntimeHost(createAssistantMessage({ text: "legacy" }));
		const response = createAssistantMessage();
		const prompt = vi.fn(async () => response);
		const abort = vi.fn(async () => ({ status: "idle" as const }));
		const createRuntime = vi.fn(() => ({
			harness: { abort },
			profile: {},
			session: {},
			prompt,
			subscribe: vi.fn(() => () => {}),
		}));

		const exitCode = await runPrintMode(
			runtimeHost as unknown as Parameters<typeof runPrintMode>[0],
			{
				mode: "text",
				aizenRuntime: true,
				initialMessage: "Inspect the project",
				messages: ["Summarize it"],
			},
			{ createAizenRuntime: createRuntime as unknown as typeof createAizenRuntime },
		);

		expect(exitCode).toBe(0);
		expect(createRuntime).toHaveBeenCalledWith({ agentSession: runtimeHost.session, cwd: "/workspace" });
		expect(prompt).toHaveBeenNthCalledWith(1, "Inspect the project", { images: undefined });
		expect(prompt).toHaveBeenNthCalledWith(2, "Summarize it");
		expect(runtimeHost.session.bindExtensions).not.toHaveBeenCalled();
	});

	it("streams opted-in Aizen events in json mode", async () => {
		const runtimeHost = createRuntimeHost(createAssistantMessage({ text: "legacy" }));
		const response = createAssistantMessage({ text: "Aizen ready" });
		const abort = vi.fn(async () => ({ status: "idle" as const }));
		let listener: ((event: { type: string }) => void) | undefined;
		const subscribe = vi.fn((next: (event: { type: string }) => void) => {
			listener = next;
			return () => {
				listener = undefined;
			};
		});
		const prompt = vi.fn(async () => {
			listener?.({ type: "agent_start" });
			listener?.({ type: "agent_settled" });
			return response;
		});
		const createRuntime = vi.fn(() => ({ harness: { abort }, profile: {}, session: {}, prompt, subscribe }));

		const exitCode = await runPrintMode(
			runtimeHost as unknown as Parameters<typeof runPrintMode>[0],
			{ mode: "json", aizenRuntime: true, initialMessage: "Inspect the project" },
			{ createAizenRuntime: createRuntime as unknown as typeof createAizenRuntime },
		);

		expect(exitCode).toBe(0);
		expect(subscribe).toHaveBeenCalledOnce();
		expect(prompt).toHaveBeenCalledWith("Inspect the project", { images: undefined });
		expect(runtimeHost.session.bindExtensions).not.toHaveBeenCalled();
	});

	it("emits session_shutdown in text mode", async () => {
		const runtimeHost = createRuntimeHost(createAssistantMessage({ text: "done" }));
		const { session } = runtimeHost;
		const images: ImageContent[] = [{ type: "image", mimeType: "image/png", data: "abc" }];

		const exitCode = await runPrintMode(runtimeHost as unknown as Parameters<typeof runPrintMode>[0], {
			mode: "text",
			initialMessage: "Say done",
			initialImages: images,
		});

		expect(exitCode).toBe(0);
		expect(session.prompt).toHaveBeenCalledWith("Say done", { images });
		expect(session.extensionRunner.emit).toHaveBeenCalledTimes(1);
		expect(session.extensionRunner.emit).toHaveBeenCalledWith({ type: "session_shutdown", reason: "quit" });
	});

	it("emits session_shutdown in json mode", async () => {
		const runtimeHost = createRuntimeHost(createAssistantMessage({ text: "done" }));
		const { session } = runtimeHost;

		const exitCode = await runPrintMode(runtimeHost as unknown as Parameters<typeof runPrintMode>[0], {
			mode: "json",
			messages: ["hello"],
		});

		expect(exitCode).toBe(0);
		expect(session.prompt).toHaveBeenCalledWith("hello");
		expect(session.extensionRunner.emit).toHaveBeenCalledTimes(1);
		expect(session.extensionRunner.emit).toHaveBeenCalledWith({ type: "session_shutdown", reason: "quit" });
	});

	it("emits session_shutdown and returns non-zero on assistant error", async () => {
		const runtimeHost = createRuntimeHost(
			createAssistantMessage({ stopReason: "error", errorMessage: "provider failure" }),
		);
		const { session } = runtimeHost;
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const exitCode = await runPrintMode(runtimeHost as unknown as Parameters<typeof runPrintMode>[0], {
			mode: "text",
		});

		expect(exitCode).toBe(1);
		expect(errorSpy).toHaveBeenCalledWith("provider failure");
		expect(session.extensionRunner.emit).toHaveBeenCalledTimes(1);
		expect(session.extensionRunner.emit).toHaveBeenCalledWith({ type: "session_shutdown", reason: "quit" });
	});
});
