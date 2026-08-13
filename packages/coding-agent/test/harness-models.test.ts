import type { Model } from "@reitaard/recode-ai";
import { describe, expect, it, vi } from "vitest";
import { createHarnessModels } from "../src/core/harness-models.ts";

const model: Model<any> = {
	id: "test-model",
	name: "Test Model",
	api: "openai-completions",
	provider: "test-provider",
	baseUrl: "http://127.0.0.1:1234/v1",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 32_768,
	maxTokens: 4_096,
};

describe("AgentHarness model bridge", () => {
	it("exposes only the requested model and resolves auth through ModelRegistry", async () => {
		const getApiKeyAndHeaders = vi.fn().mockResolvedValue({
			ok: true,
			apiKey: "private-key",
			headers: { "X-Private": "yes" },
			env: { PRIVATE_ENV: "set" },
		});
		const models = createHarnessModels(model, { getApiKeyAndHeaders } as never, "Aizen proof");

		expect(models.getModels()).toEqual([model]);
		expect(models.getProviders()).toHaveLength(1);
		await expect(models.getAuth(model)).resolves.toMatchObject({
			auth: { apiKey: "private-key" },
			env: { PRIVATE_ENV: "set" },
		});
		expect(getApiKeyAndHeaders).toHaveBeenCalledOnce();
		expect(getApiKeyAndHeaders).toHaveBeenCalledWith(model);
	});
});
