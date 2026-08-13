import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ProviderConfig } from "../src/core/extensions/types.ts";
import { recodeOpenProvider } from "../src/recode-open-provider.ts";

describe("built-in re.code Open Provider", () => {
	const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

	afterEach(() => {
		if (originalAgentDir === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = originalAgentDir;
		}
		vi.unstubAllGlobals();
	});

	it("configures a fresh user, discovers LM Studio metadata, and notifies success", async () => {
		const agentDir = await mkdtemp(join(tmpdir(), "repi-open-provider-"));
		process.env.PI_CODING_AGENT_DIR = agentDir;

		let commandHandler: ((args: string, context: ExtensionCommandContext) => Promise<void>) | undefined;
		let registeredProvider: ProviderConfig | undefined;
		const pi = {
			registerCommand: (name: string, options: { handler: typeof commandHandler }) => {
				expect(name).toBe("open-provider");
				commandHandler = options.handler;
			},
			registerProvider: (name: string, provider: ProviderConfig) => {
				expect(name).toBe("open-provider");
				registeredProvider = provider;
			},
		} as unknown as ExtensionAPI;

		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.endsWith("/api/v1/models")) {
				return new Response(
					JSON.stringify({
						models: [
							{
								key: "qwen3.5-9b",
								display_name: "Qwen3.5 9B UD",
								type: "llm",
								max_context_length: 262144,
								loaded_instances: [{ id: "qwen3.5-9b", config: { context_length: 131072 } }],
								capabilities: {
									vision: true,
									reasoning: { allowed_options: ["off", "on"], default: "on" },
								},
							},
						],
					}),
				);
			}
			return new Response(JSON.stringify({ data: [{ id: "qwen3.5-9b" }] }));
		});
		vi.stubGlobal("fetch", fetchMock);

		await recodeOpenProvider(pi);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(commandHandler).toBeDefined();

		const inputValues = ["http://127.0.0.1:1234", ""];
		const notify = vi.fn();
		const context = {
			ui: {
				input: vi.fn(async () => inputValues.shift()),
				notify,
			},
		} as unknown as ExtensionCommandContext;
		await commandHandler?.("", context);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(registeredProvider).toMatchObject({
			name: "Open Provider",
			baseUrl: "http://127.0.0.1:1234/v1",
			models: [
				{
					id: "qwen3.5-9b",
					name: "Qwen3.5 9B UD",
					reasoning: true,
					input: ["text", "image"],
					contextWindow: 131072,
				},
			],
		});
		expect(notify).toHaveBeenCalledWith("Open Provider configured with 1 chat model", "info");

		const saved = JSON.parse(await readFile(join(agentDir, "recode-open-provider.json"), "utf8"));
		expect(saved).toEqual({ baseUrl: "http://127.0.0.1:1234/v1" });

		await rm(agentDir, { recursive: true, force: true });
	});

	it("migrates a legacy saved API key into the root credential store", async () => {
		const agentDir = await mkdtemp(join(tmpdir(), "repi-open-provider-migrate-"));
		process.env.PI_CODING_AGENT_DIR = agentDir;
		await mkdir(agentDir, { recursive: true });
		await writeFile(
			join(agentDir, "recode-open-provider.json"),
			JSON.stringify({ baseUrl: "http://127.0.0.1:1234/v1", apiKey: "legacy-secret" }),
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "local-model" }] }))),
		);
		const pi = {
			registerCommand: vi.fn(),
			registerProvider: vi.fn(),
		} as unknown as ExtensionAPI;

		await recodeOpenProvider(pi);

		const config = JSON.parse(await readFile(join(agentDir, "recode-open-provider.json"), "utf8"));
		expect(config).toEqual({ baseUrl: "http://127.0.0.1:1234/v1" });
		const auth = JSON.parse(await readFile(join(agentDir, "auth.json"), "utf8"));
		expect(auth["open-provider"]).toEqual({ type: "api_key", key: "legacy-secret" });
		await rm(agentDir, { recursive: true, force: true });
	});
});
