import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "./config.ts";
import { AuthStorage } from "./core/auth-storage.ts";
import type { ExtensionAPI, ProviderModelConfig } from "./core/extensions/types.ts";

interface RecodeOpenProviderConfig {
	baseUrl: string;
	apiKey?: string;
}

export interface RecodeOpenProviderProbe {
	status: "not-configured" | "reachable" | "timeout" | "dns" | "refused" | "tls" | "network" | "http" | "empty";
	httpStatus?: number;
	modelCount?: number;
	selectedModelPresent?: boolean;
}

interface DiscoveredModel {
	id: string;
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
}

interface NativeModel {
	id: string;
	name?: string;
	type?: string;
	contextWindow?: number;
	vision: boolean;
	reasoning: boolean;
}

const DEFAULT_CONFIG: RecodeOpenProviderConfig = {
	baseUrl: "http://127.0.0.1:1234/v1",
};

const OPEN_PROVIDER_ID = "open-provider";
const OPEN_PROVIDER_LOCAL_KEY = "local";

function configPath(): string {
	return join(getAgentDir(), "recode-open-provider.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function normalizeRecodeOpenProviderBaseUrl(value: string): string {
	const trimmed = value.trim().replace(/\/+$/, "");
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function parseModels(payload: unknown): DiscoveredModel[] {
	if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
	return payload.data.flatMap((entry) => {
		if (!isRecord(entry) || typeof entry.id !== "string") return [];
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

function parseNativeModels(payload: unknown): NativeModel[] {
	if (!isRecord(payload) || !Array.isArray(payload.models)) return [];
	return payload.models.flatMap((entry) => {
		if (!isRecord(entry) || typeof entry.key !== "string") return [];

		const capabilities: Record<string, unknown> = isRecord(entry.capabilities) ? entry.capabilities : {};
		const reasoning = capabilities.reasoning;
		const hasReasoning =
			reasoning === true ||
			(isRecord(reasoning) && Array.isArray(reasoning.allowed_options) && reasoning.allowed_options.includes("on"));
		const loadedInstances = Array.isArray(entry.loaded_instances) ? entry.loaded_instances : [];
		const loadedInstance = loadedInstances.find((instance) => isRecord(instance) && instance.id === entry.key);
		const loadedConfig =
			isRecord(loadedInstance) && isRecord(loadedInstance.config) ? loadedInstance.config : undefined;
		const loadedContext =
			loadedConfig && typeof loadedConfig.context_length === "number"
				? loadedConfig.context_length
				: isRecord(loadedInstance) && typeof loadedInstance.context_length === "number"
					? loadedInstance.context_length
					: undefined;

		return [
			{
				id: entry.key,
				name: typeof entry.display_name === "string" ? entry.display_name : undefined,
				type: typeof entry.type === "string" ? entry.type : undefined,
				contextWindow:
					loadedContext ?? (typeof entry.max_context_length === "number" ? entry.max_context_length : undefined),
				vision: capabilities.vision === true,
				reasoning: hasReasoning,
			},
		];
	});
}

async function readConfig(): Promise<RecodeOpenProviderConfig | undefined> {
	try {
		const parsed: unknown = JSON.parse(await readFile(configPath(), "utf8"));
		if (!isRecord(parsed) || typeof parsed.baseUrl !== "string") return undefined;
		const config = { baseUrl: normalizeRecodeOpenProviderBaseUrl(parsed.baseUrl) };
		if (typeof parsed.apiKey === "string") {
			const authStorage = AuthStorage.create();
			if (parsed.apiKey && !storedApiKey(authStorage)) {
				authStorage.set(OPEN_PROVIDER_ID, { type: "api_key", key: parsed.apiKey });
			}
			await saveConfig(config);
		}
		return config;
	} catch {
		return undefined;
	}
}

async function saveConfig(config: RecodeOpenProviderConfig): Promise<void> {
	const path = configPath();
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify({ baseUrl: config.baseUrl }, null, 2)}\n`, "utf8");
}

function storedApiKey(authStorage: AuthStorage): string {
	const credential = authStorage.get(OPEN_PROVIDER_ID);
	const key = credential?.type === "api_key" ? (credential.key ?? "") : "";
	return key === OPEN_PROVIDER_LOCAL_KEY ? "" : key;
}

function nativeApiBaseUrl(value: string): string {
	return normalizeRecodeOpenProviderBaseUrl(value).replace(/\/v1$/, "");
}

async function discoverNativeModels(baseUrl: string, headers: Record<string, string>): Promise<NativeModel[]> {
	try {
		const response = await fetch(`${nativeApiBaseUrl(baseUrl)}/api/v1/models`, { headers });
		if (!response.ok) return [];
		return parseNativeModels(await response.json());
	} catch {
		return [];
	}
}

export async function probeRecodeOpenProvider(
	selectedModel: string | undefined,
	timeoutMs = 3_000,
): Promise<RecodeOpenProviderProbe> {
	const config = await readConfig();
	if (!config) return { status: "not-configured" };
	try {
		const apiKey = storedApiKey(AuthStorage.create());
		const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
		const response = await fetch(`${config.baseUrl}/models`, { headers, signal: AbortSignal.timeout(timeoutMs) });
		if (!response.ok) return { status: "http", httpStatus: response.status };
		const models = parseModels(await response.json());
		if (models.length === 0) return { status: "empty" };
		return {
			status: "reachable",
			modelCount: models.length,
			selectedModelPresent: selectedModel ? models.some((model) => model.id === selectedModel) : undefined,
		};
	} catch (error) {
		if (error instanceof Error && error.name === "TimeoutError") return { status: "timeout" };
		const code =
			error instanceof Error && typeof error.cause === "object" && error.cause !== null && "code" in error.cause
				? String(error.cause.code)
				: "";
		if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { status: "dns" };
		if (code === "ECONNREFUSED") return { status: "refused" };
		if (code.includes("CERT") || code.includes("TLS")) return { status: "tls" };
		return { status: "network" };
	}
}

export async function registerRecodeOpenProvider(pi: ExtensionAPI, config: RecodeOpenProviderConfig): Promise<number> {
	const headers: Record<string, string> = {};
	if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
	const baseUrl = normalizeRecodeOpenProviderBaseUrl(config.baseUrl);
	const response = await fetch(`${baseUrl}/models`, { headers });
	if (!response.ok) throw new Error(`Open Provider returned HTTP ${response.status}`);

	const nativeModels = await discoverNativeModels(baseUrl, headers);
	const nativeById = new Map(nativeModels.map((model) => [model.id, model]));
	const discovered = parseModels(await response.json()).filter((model) => {
		const nativeModel = nativeById.get(model.id);
		return nativeModel?.type !== "embedding" && !/(embed|embedding|rerank)/i.test(model.id);
	});
	if (discovered.length === 0) throw new Error("Open Provider returned no chat models");

	const models: ProviderModelConfig[] = discovered.map((model) => {
		const nativeModel = nativeById.get(model.id);
		const reasoning = nativeModel?.reasoning ?? false;
		return {
			id: model.id,
			name: nativeModel?.name ?? model.name ?? model.id,
			reasoning,
			thinkingLevelMap: reasoning ? { minimal: null, low: null, high: null, xhigh: null, max: null } : undefined,
			input: nativeModel?.vision ? ["text", "image"] : ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: nativeModel?.contextWindow ?? model.contextWindow ?? 32768,
			maxTokens: model.maxTokens ?? 8192,
			compat: reasoning ? { thinkingFormat: "qwen-chat-template", supportsReasoningEffort: false } : undefined,
		};
	});

	pi.registerProvider("open-provider", {
		name: "Open Provider",
		baseUrl,
		api: "openai-completions",
		apiKey: config.apiKey || "local",
		authHeader: (config.apiKey?.length ?? 0) > 0,
		models,
	});
	return models.length;
}

export async function recodeOpenProvider(pi: ExtensionAPI): Promise<void> {
	const savedConfig = await readConfig();
	const authStorage = AuthStorage.create();
	if (!authStorage.hasAuth(OPEN_PROVIDER_ID)) {
		authStorage.set(OPEN_PROVIDER_ID, { type: "api_key", key: OPEN_PROVIDER_LOCAL_KEY });
	}
	let config: RecodeOpenProviderConfig = {
		baseUrl: savedConfig?.baseUrl ?? DEFAULT_CONFIG.baseUrl,
		apiKey: storedApiKey(authStorage),
	};

	if (savedConfig) {
		try {
			await registerRecodeOpenProvider(pi, config);
		} catch (error) {
			console.warn(`Open Provider discovery failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	pi.registerCommand("open-provider", {
		description: "Configure and refresh the dynamic Open Provider",
		handler: async (_args, ctx) => {
			const baseUrl = await ctx.ui.input("Open Provider Base URL", config.baseUrl);
			if (baseUrl === undefined || baseUrl.trim() === "") return;
			const apiKey = await ctx.ui.input(
				config.apiKey
					? "Open Provider API key (optional; blank keeps saved key, '-' clears it)"
					: "Open Provider API key (optional)",
				"",
			);
			if (apiKey === undefined) return;

			const nextApiKey = apiKey === "-" ? "" : apiKey.trim() || storedApiKey(authStorage);
			authStorage.set(OPEN_PROVIDER_ID, {
				type: "api_key",
				key: nextApiKey || OPEN_PROVIDER_LOCAL_KEY,
			});
			config = {
				baseUrl: normalizeRecodeOpenProviderBaseUrl(baseUrl),
				apiKey: nextApiKey,
			};
			await saveConfig(config);
			try {
				const count = await registerRecodeOpenProvider(pi, config);
				ctx.ui.notify(`Open Provider configured with ${count} chat model${count === 1 ? "" : "s"}`, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}
