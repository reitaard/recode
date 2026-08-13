import type { AssistantMessage, AssistantMessageEvent, Model } from "@reitaard/recode-ai";
import { EventStream } from "@reitaard/recode-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { runAgentLoop } from "../src/agent-loop.ts";
import { IterationBudget } from "../src/iteration-budget.ts";
import type { AgentContext, AgentLoopConfig, AgentMessage, AgentTool } from "../src/types.ts";

class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected event type");
			},
		);
	}
}

const model: Model<"openai-responses"> = {
	id: "mock",
	name: "mock",
	api: "openai-responses",
	provider: "openai",
	baseUrl: "https://example.invalid",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8192,
	maxTokens: 2048,
};

function assistant(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: Date.now(),
	};
}

describe("IterationBudget", () => {
	it("consumes atomically under interleaved callers and fails closed at the cap", async () => {
		const budget = new IterationBudget(100);
		const consumed = await Promise.all(
			Array.from({ length: 1_000 }, async () => {
				await Promise.resolve();
				return budget.consume();
			}),
		);
		expect(consumed.filter(Boolean)).toHaveLength(100);
		expect(budget.used).toBe(100);
		expect(budget.remaining).toBe(0);
		expect(budget.consume()).toBe(false);
	});

	it("refunds without underflow and restores one consume", () => {
		const budget = new IterationBudget(2);
		expect(budget.consume()).toBe(true);
		expect(budget.consume()).toBe(true);
		expect(budget.consume()).toBe(false);
		budget.refund();
		expect(budget.used).toBe(1);
		expect(budget.consume()).toBe(true);
		budget.refund();
		budget.refund();
		budget.refund();
		expect(budget.used).toBe(0);
	});

	it("bounds provider calls in the real agent loop", async () => {
		const parameters = Type.Object({});
		const tool: AgentTool<typeof parameters, undefined> = {
			name: "continue",
			label: "Continue",
			description: "Continue the loop",
			parameters,
			async execute() {
				return { content: [{ type: "text", text: "continue" }], details: undefined };
			},
		};
		const context: AgentContext = { systemPrompt: "", messages: [], tools: [tool] };
		const config: AgentLoopConfig = {
			model,
			maxIterations: 1,
			convertToLlm: (messages) =>
				messages.filter(
					(message) => message.role === "user" || message.role === "assistant" || message.role === "toolResult",
				),
		};
		let providerCalls = 0;
		const streamFn = () => {
			providerCalls += 1;
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				stream.push({
					type: "done",
					reason: "toolUse",
					message: assistant([{ type: "toolCall", id: "continue-1", name: "continue", arguments: {} }], "toolUse"),
				});
			});
			return stream;
		};
		const prompt: AgentMessage = { role: "user", content: "loop", timestamp: Date.now() };
		const messages = await runAgentLoop([prompt], context, config, () => undefined, undefined, streamFn);
		const exhausted = messages.at(-1);
		expect(exhausted?.role).toBe("assistant");
		if (exhausted?.role === "assistant") {
			expect(exhausted.stopReason).toBe("error");
			expect(exhausted.errorMessage).toContain("iteration budget exhausted after 1 provider calls");
		}
		expect(providerCalls).toBe(1);
	});
});
