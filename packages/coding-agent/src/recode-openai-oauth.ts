import type { Api, Model } from "@reitaard/recode-ai";
import { getModels } from "@reitaard/recode-ai/compat";
import type { ExtensionAPI, ProviderModelConfig } from "./core/extensions/types.ts";

const DEFAULT_BASE_URL = "http://127.0.0.1:10531/v1";
const BASE_URL_ENV = "RECODE_OPENAI_OAUTH_BASE_URL";
const STARTUP_DISCOVERY_TIMEOUT_MS = 1500;
const MANUAL_DISCOVERY_TIMEOUT_MS = 10000;

interface DiscoveredModel {
	id: string;
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
}

const ZERO_COST: ProviderModelConfig["cost"] = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function normalizeRecodeOpenAIOAuthBaseUrl(value: string): string {
	const trimmed = value.trim().replace(/\/+$/, "");
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function configuredBaseUrl(): string {
	return normalizeRecodeOpenAIOAuthBaseUrl(process.env[BASE_URL_ENV] || DEFAULT_BASE_URL);
}

function parseModels(payload: unknown): DiscoveredModel[] {
	if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
	return payload.data.flatMap((entry) => {
		if (!isRecord(entry) || typeof entry.id !== "string" || entry.id.length === 0) return [];
		return [
			{
				id: entry.id,
				name: typeof entry.name === "string" ? entry.name : undefined,
				contextWindow: typeof entry.context_window === "number" ? entry.context_window : undefined,
				maxTokens: typeof entry.max_tokens === "number" ? entry.max_tokens : undefined,
			},
		];
	});
}

function isChatModel(model: DiscoveredModel): boolean {
	return !/(^|[-_.])(embed|embedding|rerank)([-_.]|$)/i.test(model.id) && !/^gpt-image(?:-|$)/i.test(model.id);
}

function displayName(id: string): string {
	return id
		.split(/[-_]/g)
		.filter(Boolean)
		.map((part) => {
			if (/^gpt$/i.test(part)) return "GPT";
			if (/^\d+(?:\.\d+)*$/.test(part)) return part;
			return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
		})
		.join(" ");
}

function inferredReasoningMetadata(id: string): Pick<ProviderModelConfig, "reasoning" | "thinkingLevelMap"> {
	const reasoning = /^gpt-5(?:[.-]|$)/i.test(id);
	if (!reasoning) return { reasoning: false };

	return {
		reasoning: true,
		thinkingLevelMap: /^gpt-5\.6(?:-|$)/i.test(id)
			? { minimal: "low", xhigh: "xhigh", max: "max" }
			: { minimal: "low", xhigh: "xhigh" },
	};
}

function inferredContextWindow(id: string): number | undefined {
	if (/^gpt-5\.6(?:-|$)/i.test(id)) return 372000;
	if (/^gpt-5(?:[.-]|$)/i.test(id)) return 272000;
	return undefined;
}

function inferredMaxTokens(id: string): number | undefined {
	return /^gpt-5(?:[.-]|$)/i.test(id) ? 128000 : undefined;
}

function codexCatalogById(): Map<string, Model<Api>> {
	return new Map((getModels("openai-codex") as Model<Api>[]).map((model) => [model.id, model]));
}

function toProviderModel(model: DiscoveredModel, catalog: Map<string, Model<Api>>): ProviderModelConfig {
	const known = catalog.get(model.id);
	const inferred = inferredReasoningMetadata(model.id);
	const reasoning = known?.reasoning ?? inferred.reasoning;
	const thinkingLevelMap = known?.thinkingLevelMap ? { ...known.thinkingLevelMap } : inferred.thinkingLevelMap;
	const input: ProviderModelConfig["input"] = known?.input
		? [...known.input]
		: /^gpt-/i.test(model.id)
			? ["text", "image"]
			: ["text"];

	return {
		id: model.id,
		name: `${known?.name ?? model.name ?? displayName(model.id)} (OAuth)`,
		api: "openai-responses",
		reasoning,
		thinkingLevelMap,
		input,
		cost: ZERO_COST,
		contextWindow: model.contextWindow ?? inferredContextWindow(model.id) ?? known?.contextWindow ?? 32768,
		maxTokens: model.maxTokens ?? inferredMaxTokens(model.id) ?? known?.maxTokens ?? 8192,
		compat: {
			...known?.compat,
			supportsLongCacheRetention: false,
		},
	};
}

async function discoverModels(baseUrl: string, timeoutMs: number): Promise<DiscoveredModel[]> {
	const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(timeoutMs) });
	if (!response.ok) throw new Error(`OpenAI OAuth proxy returned HTTP ${response.status}`);
	const models = parseModels(await response.json()).filter(isChatModel);
	if (models.length === 0) throw new Error("OpenAI OAuth proxy returned no chat models");
	return models;
}

export async function registerRecodeOpenAIOAuth(
	pi: ExtensionAPI,
	baseUrl = configuredBaseUrl(),
	timeoutMs = MANUAL_DISCOVERY_TIMEOUT_MS,
): Promise<number> {
	const normalizedBaseUrl = normalizeRecodeOpenAIOAuthBaseUrl(baseUrl);
	const discovered = await discoverModels(normalizedBaseUrl, timeoutMs);
	const catalog = codexCatalogById();
	const models = discovered.map((model) => toProviderModel(model, catalog));

	pi.registerProvider("openai-oauth", {
		name: "OpenAI OAuth",
		baseUrl: normalizedBaseUrl,
		api: "openai-responses",
		apiKey: "local",
		authHeader: false,
		models,
	});

	return models.length;
}

export async function recodeOpenAIOAuth(pi: ExtensionAPI): Promise<void> {
	const baseUrl = configuredBaseUrl();

	try {
		await registerRecodeOpenAIOAuth(pi, baseUrl, STARTUP_DISCOVERY_TIMEOUT_MS);
	} catch {
		// Optional provider: a stopped local proxy must not delay or break startup.
	}

	pi.registerCommand("openai-oauth", {
		description: "Refresh models from the local OpenAI OAuth proxy",
		handler: async (_args, ctx) => {
			try {
				const count = await registerRecodeOpenAIOAuth(pi, baseUrl, MANUAL_DISCOVERY_TIMEOUT_MS);
				ctx.ui.notify(`OpenAI OAuth refreshed with ${count} chat model${count === 1 ? "" : "s"}`, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}
