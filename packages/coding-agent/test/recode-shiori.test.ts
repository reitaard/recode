import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RecodeMemoryRuntime } from "../src/core/recode-memory/recode-memory-runtime.ts";
import { type SessionEntry, SessionManager } from "../src/core/session-manager.ts";
import {
	addRecodeShioriResponseFormat,
	getRecodeLmStudioNativeChatUrl,
	runRecodeShioriHarness,
} from "../src/core/workers/shiori/harness.ts";
import {
	buildRecodeShioriReviewChunks,
	executeRecodeShiori,
	getRecodeShioriCheckpoint,
	getRecodeShioriGreeting,
	parseRecodeShioriCandidates,
	RECODE_SHIORI_CHECKPOINT,
} from "../src/core/workers/shiori/reviewer.ts";
import { normalizeRecodeMemoryConfig } from "../src/recode-memory.ts";

function userEntry(id: string, parentId: string | null, text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2026-07-17T00:00:00.000Z",
		message: { role: "user", content: text, timestamp: 0 },
	};
}

describe("Shiori (栞) memory review", () => {
	it("adds a strict memories schema without changing other provider payload fields", () => {
		const payload = addRecodeShioriResponseFormat({ model: "qwen3.5-9b", stream: true }) as Record<string, unknown>;
		expect(payload.model).toBe("qwen3.5-9b");
		expect(payload.stream).toBe(true);
		expect(payload.response_format).toMatchObject({
			type: "json_schema",
			json_schema: {
				name: "repi_shiori_memories",
				strict: true,
				schema: {
					type: "object",
					required: ["memories"],
				},
			},
		});
	});

	it("uses LM Studio native reasoning-off inference only for /v1 base URLs", async () => {
		expect(getRecodeLmStudioNativeChatUrl("http://127.0.0.1:1234/v1")).toBe("http://127.0.0.1:1234/api/v1/chat");
		expect(getRecodeLmStudioNativeChatUrl("https://example.com/openai/v1")).toBeUndefined();

		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					output: [{ type: "message", content: '{"memories":[]}' }],
					stats: { reasoning_output_tokens: 0, total_output_tokens: 6 },
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		try {
			await expect(
				runRecodeShioriHarness({
					cwd: "/project",
					model: {
						id: "qwen3.5-9b",
						name: "Qwen3.5 9B",
						api: "openai-completions",
						provider: "open-provider",
						baseUrl: "http://127.0.0.1:1234/v1",
						reasoning: true,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 32768,
						maxTokens: 8192,
					},
					modelRegistry: {
						getApiKeyAndHeaders: vi.fn().mockResolvedValue({
							ok: true,
							apiKey: "test-key",
							headers: { "X-Test": "yes" },
						}),
					} as never,
					systemPrompt: "Review memory.",
					prompt: "Transcript",
					thinking: false,
				}),
			).resolves.toBe('{"memories":[]}');
		} finally {
			vi.unstubAllGlobals();
		}

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("http://127.0.0.1:1234/api/v1/chat");
		expect(init.headers).toMatchObject({ Authorization: "Bearer test-key", "X-Test": "yes" });
		expect(JSON.parse(String(init.body))).toMatchObject({
			model: "qwen3.5-9b",
			reasoning: "off",
			max_output_tokens: 1024,
			store: false,
		});
	});

	it("omits reasoning for LM Studio models that do not expose reasoning configuration", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					output: [{ type: "message", content: '{"memories":[]}' }],
					stats: { reasoning_output_tokens: 0, total_output_tokens: 6 },
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			await expect(
				runRecodeShioriHarness({
					cwd: "/project",
					model: {
						id: "qwen2.5-3b-instruct",
						name: "Qwen 2.5 3B Instruct",
						api: "openai-completions",
						provider: "open-provider",
						baseUrl: "http://127.0.0.1:1234/v1",
						reasoning: false,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 32768,
						maxTokens: 4096,
					},
					modelRegistry: {
						getApiKeyAndHeaders: vi.fn().mockResolvedValue({
							ok: true,
							apiKey: "test-key",
							headers: {},
						}),
					} as never,
					systemPrompt: "Review memory.",
					prompt: "Transcript",
					thinking: false,
				}),
			).resolves.toBe('{"memories":[]}');

			const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(String(init.body)) as Record<string, unknown>;
			expect(body).not.toHaveProperty("reasoning");
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("retries once when LM Studio returns malformed JSON", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						output: [{ type: "message", content: '{"memories":[]' }],
						stats: { reasoning_output_tokens: 0, total_output_tokens: 5 },
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						output: [{ type: "message", content: '{"memories":[]}' }],
						stats: { reasoning_output_tokens: 0, total_output_tokens: 6 },
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);

		vi.stubGlobal("fetch", fetchMock);

		const sessionManager = SessionManager.inMemory("/project");
		sessionManager.appendMessage({
			role: "user",
			content: "Always verify focused tests before committing.",
			timestamp: 0,
		});

		try {
			const result = await executeRecodeShiori({
				cwd: "/project",
				sessionManager,
				modelRegistry: {
					getApiKeyAndHeaders: vi.fn().mockResolvedValue({
						ok: true,
						apiKey: "test-key",
						headers: {},
					}),
				} as never,
				projectTrusted: true,
				config: normalizeRecodeMemoryConfig({}),
				manager: {
					search: vi.fn().mockResolvedValue([]),
					write: vi.fn(),
					sync: vi.fn(),
				} as never,
				model: {
					id: "qwen2.5-3b-instruct",
					name: "Qwen 2.5 3B Instruct",
					api: "openai-completions",
					provider: "open-provider",
					baseUrl: "http://127.0.0.1:1234/v1",
					reasoning: false,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 32768,
					maxTokens: 4096,
				},
				appendMessage: vi.fn(),
			});

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(result).toMatchObject({
				reviewedEntries: 1,
				saved: 0,
			});
			expect(getRecodeShioriCheckpoint(sessionManager.getBranch())).toMatchObject({
				saved: 0,
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("greets from the local time without spending a model call", () => {
		expect(getRecodeShioriGreeting(new Date(2026, 6, 17, 8), () => 0)).toBe(
			"Good morning. Your memory is safe within my pages.",
		);
		expect(getRecodeShioriGreeting(new Date(2026, 6, 17, 13), () => 0.2)).toMatch(/^Good afternoon\./);
		expect(getRecodeShioriGreeting(new Date(2026, 6, 17, 20), () => 0.999)).toBe(
			"Good evening. Saved. I won't bring it up unless it's useful.",
		);
	});

	it("defaults to automatic Cardinal routing and preserves explicit choices", () => {
		expect(normalizeRecodeMemoryConfig({}).cardinalRouting).toBe("auto");
		expect(normalizeRecodeMemoryConfig({}).shioriThinking).toBe(false);
		expect(
			normalizeRecodeMemoryConfig({
				shioriThinking: true,
				shioriModel: { provider: "open-provider", id: "qwen3.5-9b" },
			}),
		).toMatchObject({
			shioriThinking: true,
			shioriModel: { provider: "open-provider", id: "qwen3.5-9b" },
		});
		expect(normalizeRecodeMemoryConfig({ cardinalRouting: "ask" }).cardinalRouting).toBe("ask");
		expect(normalizeRecodeMemoryConfig({ shioriRouting: "project" }).cardinalRouting).toBe("project");
		expect(normalizeRecodeMemoryConfig({ cardinalRouting: "invalid" }).cardinalRouting).toBe("auto");
	});

	it("reviews only entries after the latest session checkpoint", () => {
		const first = userEntry("first", null, "Always run focused tests before broad checks.");
		const checkpoint: SessionEntry = {
			type: "custom",
			id: "checkpoint",
			parentId: first.id,
			timestamp: "2026-07-17T00:01:00.000Z",
			customType: RECODE_SHIORI_CHECKPOINT,
			data: {
				lastReviewedEntryId: first.id,
				reviewedAt: "2026-07-17T00:01:00.000Z",
				saved: 1,
			},
		};
		const second = userEntry("second", checkpoint.id, "Use project memory for repository decisions.");
		const branch = [first, checkpoint, second];

		expect(getRecodeShioriCheckpoint(branch)).toMatchObject({ lastReviewedEntryId: "first", saved: 1 });
		const review = buildRecodeShioriReviewChunks(branch);
		expect(review.pendingEntries).toBe(1);
		expect(review.chunks).toHaveLength(1);
		expect(review.chunks[0]?.transcript).toContain("[second] USER");
		expect(review.chunks[0]?.transcript).not.toContain("[first] USER");
	});

	it("reviews every bounded batch with live progress when review all is requested", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "repi-shiori-review-all-"));
		const runtime = new RecodeMemoryRuntime();
		runtime.setConfig(normalizeRecodeMemoryConfig({ cardinalRouting: "project" }));
		const sessionManager = SessionManager.inMemory(cwd);
		for (let index = 0; index < 5; index++) {
			sessionManager.appendMessage({
				role: "user",
				content: `Entry ${index}: ${"x".repeat(24_000)}`,
				timestamp: index,
			});
		}
		const fetchMock = vi.fn().mockImplementation(
			async () =>
				new Response(JSON.stringify({ output: [{ type: "message", content: '{"memories":[]}' }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const progress: Array<{ type: string; reviewedEntries?: number; totalEntries?: number }> = [];
		const appendMessage = vi.fn();
		try {
			const result = await runtime.runShioriAll({
				cwd,
				sessionManager,
				modelRegistry: {
					getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key", headers: {} }),
				} as never,
				projectTrusted: true,
				model: {
					id: "qwen3.5-9b",
					name: "Qwen3.5 9B",
					api: "openai-completions",
					provider: "open-provider",
					baseUrl: "http://127.0.0.1:1234/v1",
					reasoning: true,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 32768,
					maxTokens: 8192,
				},
				onProgress: (event) => progress.push(event),
				appendMessage,
			});

			expect(result).toMatchObject({ reviewedEntries: 5, hasMore: false });
			expect(fetchMock).toHaveBeenCalledTimes(5);
			expect(progress[0]).toMatchObject({ type: "start", reviewedEntries: 0, totalEntries: 5 });
			expect(progress.filter((event) => event.type === "progress").map((event) => event.reviewedEntries)).toEqual([
				1, 2, 3, 4, 5,
			]);
			expect(appendMessage).toHaveBeenCalledWith(expect.stringContaining("Reviewed 5/5 entries"));
			expect(getRecodeShioriCheckpoint(sessionManager.getBranch())).toMatchObject({
				lastReviewedEntryId: expect.any(String),
			});
		} finally {
			runtime.close();
			vi.unstubAllGlobals();
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("accepts fenced JSON, rejects low-confidence noise, normalizes tags, and deduplicates candidates", () => {
		const output = `A discarded draft looked like {memories: pending}. Here is the result:\n\`\`\`json
{
  "memories": [
    {
      "text": "The user prefers focused tests before broad checks.",
      "tags": ["User Preference", "testing"],
      "scope": "global",
      "kind": "preference",
      "confidence": 0.93,
      "evidenceEntryIds": ["entry-a"]
    },
    {
      "text": "The user prefers focused tests before broad checks.",
      "tags": ["testing"],
      "scope": "global",
      "kind": "preference",
      "confidence": 0.91,
      "evidenceEntryIds": ["entry-a"]
    },
    {
      "text": "A weak guess should not persist.",
      "tags": [],
      "scope": "project",
      "kind": "fact",
      "confidence": 0.2,
      "evidenceEntryIds": []
    }
  ]
}
\`\`\``;

		const candidates = parseRecodeShioriCandidates(output);
		expect(candidates).toHaveLength(1);
		expect(candidates[0]).toMatchObject({
			text: "The user prefers focused tests before broad checks.",
			scope: "global",
			kind: "preference",
		});
		expect(candidates[0]?.tags).toEqual(["preference", "testing"]);
	});

	it("finishes the original session review after the UI switches sessions", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "repi-shiori-runtime-"));
		const runtime = new RecodeMemoryRuntime();
		runtime.setConfig(normalizeRecodeMemoryConfig({ cardinalRouting: "auto" }));
		const reviewingStates: boolean[] = [];
		const unsubscribe = runtime.subscribeShiori((state) => reviewingStates.push(state.reviewing));
		const original = SessionManager.inMemory(cwd);
		original.appendMessage({ role: "user", content: "Always run focused tests before broad checks.", timestamp: 0 });
		let releaseResponse!: () => void;
		const responseReady = new Promise<void>((resolve) => {
			releaseResponse = resolve;
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				await responseReady;
				return new Response(
					JSON.stringify({
						output: [
							{
								type: "message",
								content:
									'{"memories":[{"text":"Run focused tests before broad checks.","tags":["testing"],"scope":"global","kind":"workflow","confidence":0.95,"evidenceEntryIds":[]}]}',
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}),
		);
		const chooseScope = vi.fn().mockResolvedValue("global");
		const appendMessage = vi.fn();
		try {
			const review = runtime.runShiori({
				cwd,
				sessionManager: original,
				modelRegistry: {
					getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key", headers: {} }),
				} as never,
				projectTrusted: true,
				chooseScope,
				appendMessage,
				model: {
					id: "qwen3.5-9b",
					name: "Qwen3.5 9B",
					api: "openai-completions",
					provider: "open-provider",
					baseUrl: "http://127.0.0.1:1234/v1",
					reasoning: true,
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 32768,
					maxTokens: 8192,
				},
			});
			expect(runtime.isShioriReviewing()).toBe(true);
			SessionManager.inMemory(cwd);
			releaseResponse();
			await expect(review).resolves.toMatchObject({ saved: 1, reviewedEntries: 1 });
			expect(runtime.isShioriReviewing()).toBe(false);
			expect(reviewingStates).toEqual([true, false]);
			expect(chooseScope).not.toHaveBeenCalled();
			expect(appendMessage).toHaveBeenCalledTimes(2);
			expect(appendMessage).toHaveBeenLastCalledWith(expect.stringContaining("Saved 1 memory"));
			expect(getRecodeShioriCheckpoint(original.getBranch())).toMatchObject({ saved: 1 });
			expect(await readFile(join(cwd, ".pi", "memory", "MEMORY.md"), "utf8")).toContain(
				"Run focused tests before broad checks.",
			);
		} finally {
			unsubscribe();
			runtime.close();
			vi.unstubAllGlobals();
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
