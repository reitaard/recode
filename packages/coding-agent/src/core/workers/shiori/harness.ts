import { AgentHarness, InMemorySessionStorage, Session } from "@reitaard/recode-agent-core";
import { NodeExecutionEnv } from "@reitaard/recode-agent-core/node";
import type { AssistantMessage, Model } from "@reitaard/recode-ai";
import { createHarnessModels } from "../../harness-models.ts";
import type { ModelRegistry } from "../../model-registry.ts";

const SHIORI_NON_THINKING_MAX_OUTPUT_TOKENS = 1024;
const SHIORI_THINKING_MAX_OUTPUT_TOKENS = 4096;
const SHIORI_MAX_ITERATIONS = 50;

const RECODE_SHIORI_RESPONSE_FORMAT = {
	type: "json_schema",
	json_schema: {
		name: "repi_shiori_memories",
		strict: true,
		schema: {
			type: "object",
			additionalProperties: false,
			properties: {
				memories: {
					type: "array",
					maxItems: 5,
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							text: { type: "string" },
							tags: { type: "array", items: { type: "string" }, maxItems: 4 },
							scope: { type: "string", enum: ["project", "global"] },
							kind: {
								type: "string",
								enum: ["correction", "decision", "fact", "lesson", "preference", "workflow"],
							},
							confidence: { type: "number", minimum: 0, maximum: 1 },
							evidenceEntryIds: { type: "array", items: { type: "string" }, maxItems: 3 },
						},
						required: ["text", "tags", "scope", "kind", "confidence", "evidenceEntryIds"],
					},
				},
			},
			required: ["memories"],
		},
	},
} as const;

export function addRecodeShioriResponseFormat(payload: unknown): unknown {
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return payload;
	return { ...payload, response_format: RECODE_SHIORI_RESPONSE_FORMAT };
}

function assistantText(message: AssistantMessage): string {
	return message.content
		.filter(
			(content): content is Extract<(typeof message.content)[number], { type: "text" }> => content.type === "text",
		)
		.map((content) => content.text)
		.join("\n")
		.trim();
}

interface RecodeLmStudioChatResponse {
	output?: Array<{ type?: string; content?: string }>;
	stats?: {
		reasoning_output_tokens?: number;
		total_output_tokens?: number;
	};
}

export function getRecodeLmStudioNativeChatUrl(baseUrl: string): string | undefined {
	try {
		const url = new URL(baseUrl);
		if (!/^\/v1\/?$/.test(url.pathname)) return undefined;
		url.pathname = "/api/v1/chat";
		url.search = "";
		url.hash = "";
		return url.toString();
	} catch {
		return undefined;
	}
}

async function tryRunRecodeLmStudioNative(options: {
	model: Model<any>;
	modelRegistry: ModelRegistry;
	systemPrompt: string;
	prompt: string;
	thinking: boolean;
}): Promise<string | undefined> {
	if (options.model.api !== "openai-completions") return undefined;
	const url = getRecodeLmStudioNativeChatUrl(options.model.baseUrl);
	if (!url) return undefined;

	const resolved = await options.modelRegistry.getApiKeyAndHeaders(options.model);
	if (!resolved.ok) throw new Error(resolved.error);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...resolved.headers,
	};
	if (resolved.apiKey && !headers.Authorization && !headers.authorization) {
		headers.Authorization = `Bearer ${resolved.apiKey}`;
	}

	const requestBody: Record<string, unknown> = {
		model: options.model.id,
		system_prompt: options.systemPrompt,
		input: options.prompt,
		max_output_tokens: options.thinking ? SHIORI_THINKING_MAX_OUTPUT_TOKENS : SHIORI_NON_THINKING_MAX_OUTPUT_TOKENS,
		// Memory extraction benefits from stable formatting more than creative
		// variation. Keep thinking runs at the model's normal sampling level.
		temperature: options.thinking ? 0.6 : 0.2,
		top_p: options.thinking ? 0.95 : 0.8,
		top_k: 20,
		min_p: 0,
		store: false,
		stream: false,
	};

	// Some LM Studio models reject the request when the reasoning field exists,
	// even when its value is "off". Only send it for reasoning-capable models.
	if (options.model.reasoning) {
		requestBody.reasoning = options.thinking ? "on" : "off";
	}

	const response = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(requestBody),
	});
	if (response.status === 404 || response.status === 405) return undefined;
	if (!response.ok) {
		const detail = (await response.text()).trim().slice(0, 500);
		throw new Error(`LM Studio Shiori request failed (${response.status})${detail ? `: ${detail}` : ""}`);
	}

	const result = (await response.json()) as RecodeLmStudioChatResponse;
	const reasoningTokens = result.stats?.reasoning_output_tokens ?? 0;
	if (!options.thinking && reasoningTokens > 0) {
		throw new Error(`LM Studio did not honor Shiori reasoning=off (${reasoningTokens} reasoning tokens)`);
	}
	const text =
		result.output
			?.filter((item) => item.type === "message" && typeof item.content === "string")
			.map((item) => item.content!.trim())
			.filter(Boolean)
			.join("\n") ?? "";
	if (!text) {
		throw new Error(
			`LM Studio returned an empty Shiori review (output: ${result.stats?.total_output_tokens ?? "unknown"})`,
		);
	}
	return text;
}

/**
 * Run one isolated, tool-free Shiori review through the portable AgentHarness.
 * The provider bridge reuses Recode's current model and resolved credentials while
 * keeping the coding session, coding prompt, tools, and queues out of the call.
 */
export async function runRecodeShioriHarness(options: {
	cwd: string;
	model: Model<any>;
	modelRegistry: ModelRegistry;
	systemPrompt: string;
	prompt: string;
	thinking: boolean;
}): Promise<string> {
	const nativeLmStudioReview = await tryRunRecodeLmStudioNative(options);
	if (nativeLmStudioReview !== undefined) return nativeLmStudioReview;

	const requestModel: Model<any> = {
		...options.model,
		maxTokens: Math.min(
			options.model.maxTokens ||
				(options.thinking ? SHIORI_THINKING_MAX_OUTPUT_TOKENS : SHIORI_NON_THINKING_MAX_OUTPUT_TOKENS),
			options.thinking ? SHIORI_THINKING_MAX_OUTPUT_TOKENS : SHIORI_NON_THINKING_MAX_OUTPUT_TOKENS,
		),
	};
	const models = createHarnessModels(requestModel, options.modelRegistry, "Shiori");

	const harness = new AgentHarness({
		env: new NodeExecutionEnv({ cwd: options.cwd }),
		session: new Session(new InMemorySessionStorage()),
		models,
		model: requestModel,
		thinkingLevel: options.thinking ? "medium" : "off",
		maxIterations: SHIORI_MAX_ITERATIONS,
		systemPrompt: options.systemPrompt,
		tools: [],
	});
	if (requestModel.api === "openai-completions") {
		harness.on("before_provider_payload", (event) => ({
			payload: addRecodeShioriResponseFormat(event.payload),
		}));
	}
	const response = await harness.prompt(options.prompt);
	if (response.stopReason === "error" || response.stopReason === "aborted") {
		throw new Error(response.errorMessage || `Shiori review stopped: ${response.stopReason}`);
	}
	const text = assistantText(response);
	if (!text) {
		const contentTypes = response.content.map((content) => content.type).join(", ") || "none";
		throw new Error(
			`Shiori returned an empty review (stop: ${response.stopReason}; content: ${contentTypes}; output: ${response.usage.output}; reasoning: ${response.usage.reasoning})`,
		);
	}
	return text;
}
