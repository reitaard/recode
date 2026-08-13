import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ProviderConfig } from "../src/core/extensions/types.ts";
import { recodeOpenAIOAuth } from "../src/recode-openai-oauth.ts";

describe("built-in Recode OpenAI OAuth provider", () => {
	const originalBaseUrl = process.env.RECODE_OPENAI_OAUTH_BASE_URL;

	afterEach(() => {
		if (originalBaseUrl === undefined) {
			delete process.env.RECODE_OPENAI_OAUTH_BASE_URL;
		} else {
			process.env.RECODE_OPENAI_OAUTH_BASE_URL = originalBaseUrl;
		}
		vi.unstubAllGlobals();
	});

	it("discovers proxy models and preserves Codex reasoning metadata", async () => {
		let commandHandler: ((args: string, context: ExtensionCommandContext) => Promise<void>) | undefined;
		let registeredProvider: ProviderConfig | undefined;
		const pi = {
			registerCommand: (name: string, options: { handler: typeof commandHandler }) => {
				expect(name).toBe("openai-oauth");
				commandHandler = options.handler;
			},
			registerProvider: (name: string, provider: ProviderConfig) => {
				expect(name).toBe("openai-oauth");
				registeredProvider = provider;
			},
		} as unknown as ExtensionAPI;

		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						data: [
							{ id: "gpt-5.6-sol" },
							{ id: "gpt-5.6-terra" },
							{ id: "gpt-5.6-luna" },
							{ id: "gpt-5.5" },
							{ id: "gpt-5.4" },
							{ id: "gpt-5.4-mini" },
							{ id: "gpt-image-2" },
						],
					}),
				),
		);
		vi.stubGlobal("fetch", fetchMock);

		await recodeOpenAIOAuth(pi);

		expect(fetchMock).toHaveBeenCalledWith(
			"http://127.0.0.1:10531/v1/models",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(commandHandler).toBeDefined();
		expect(registeredProvider).toMatchObject({
			name: "OpenAI OAuth",
			baseUrl: "http://127.0.0.1:10531/v1",
			api: "openai-responses",
			apiKey: "local",
			authHeader: false,
		});
		expect(registeredProvider?.models).toHaveLength(6);
		expect(registeredProvider?.models?.some((model) => model.id === "gpt-image-2")).toBe(false);

		const terra = registeredProvider?.models?.find((model) => model.id === "gpt-5.6-terra");
		expect(terra).toMatchObject({
			name: "GPT-5.6 Terra (OAuth)",
			api: "openai-responses",
			reasoning: true,
			thinkingLevelMap: { minimal: "low", xhigh: "xhigh", max: "max" },
			input: ["text", "image"],
			contextWindow: 372000,
			maxTokens: 128000,
			compat: {
				supportsToolSearch: true,
				supportsLongCacheRetention: false,
			},
		});

		const gpt54 = registeredProvider?.models?.find((model) => model.id === "gpt-5.4");
		expect(gpt54).toMatchObject({
			reasoning: true,
			thinkingLevelMap: { minimal: "low", xhigh: "xhigh" },
			contextWindow: 272000,
			maxTokens: 128000,
		});
		expect(gpt54?.thinkingLevelMap?.max).toBeUndefined();

		const notify = vi.fn();
		await commandHandler?.("", {
			ui: { notify },
		} as unknown as ExtensionCommandContext);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(notify).toHaveBeenCalledWith("OpenAI OAuth refreshed with 6 chat models", "info");
	});

	it("keeps startup optional when the local proxy is stopped", async () => {
		let commandRegistered = false;
		const pi = {
			registerCommand: (name: string) => {
				expect(name).toBe("openai-oauth");
				commandRegistered = true;
			},
			registerProvider: vi.fn(),
		} as unknown as ExtensionAPI;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Promise.reject(new Error("connection refused"))),
		);

		await expect(recodeOpenAIOAuth(pi)).resolves.toBeUndefined();
		expect(commandRegistered).toBe(true);
		expect(pi.registerProvider).not.toHaveBeenCalled();
	});
});
