import { sep } from "node:path";
import { visibleWidth } from "@reitaard/recode-tui";
import { beforeAll, describe, expect, it } from "vitest";
import type { AgentSession } from "../src/core/agent-session.ts";
import type { ReadonlyFooterDataProvider } from "../src/core/footer-data-provider.ts";
import { FooterComponent, formatCwdForFooter } from "../src/modes/interactive/components/footer.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

type AssistantUsage = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: { total: number };
};

function createSession(options: {
	sessionName: string;
	modelId?: string;
	provider?: string;
	reasoning?: boolean;
	thinkingLevel?: string;
	usage?: AssistantUsage;
	contextPercent?: number;
	contextTokens?: number | null;
	compactionAvailable?: boolean;
}): AgentSession {
	const usage = options.usage;
	const entries =
		usage === undefined
			? []
			: [
					{
						type: "message",
						message: {
							role: "assistant",
							usage,
						},
					},
				];

	const session = {
		state: {
			model: {
				id: options.modelId ?? "test-model",
				provider: options.provider ?? "test",
				contextWindow: 200_000,
				reasoning: options.reasoning ?? false,
			},
			thinkingLevel: options.thinkingLevel ?? "off",
		},
		sessionManager: {
			getEntries: () => entries,
			getSessionName: () => options.sessionName,
			getCwd: () => "/tmp/project",
		},
		getContextUsage: () => ({
			contextWindow: 200_000,
			tokens: options.contextTokens === undefined ? 24_600 : options.contextTokens,
			percent: options.contextPercent ?? 12.3,
		}),
		isCompactionAvailable: () => options.compactionAvailable ?? false,
		getAvailableThinkingLevels: () => ["off", "minimal", "low", "medium", "high"],
		modelRegistry: {
			isUsingOAuth: () => false,
		},
	};

	return session as unknown as AgentSession;
}

function createFooterData(providerCount: number): ReadonlyFooterDataProvider {
	const provider = {
		getGitBranch: () => "main",
		getExtensionStatuses: () => new Map<string, string>(),
		getAvailableProviderCount: () => providerCount,
		onBranchChange: (callback: () => void) => {
			void callback;
			return () => {};
		},
	};

	return provider;
}

describe("formatCwdForFooter", () => {
	it("does not abbreviate sibling paths that share the home prefix", () => {
		expect(formatCwdForFooter("/home/user2", "/home/user")).toBe("/home/user2");
	});

	it("abbreviates the home directory and descendants", () => {
		expect(formatCwdForFooter("/home/user", "/home/user")).toBe("~");
		expect(formatCwdForFooter("/home/user/project", "/home/user")).toBe(`~${sep}project`);
	});
});

describe("FooterComponent width handling", () => {
	beforeAll(() => {
		initTheme(undefined, false);
	});

	it("keeps all lines within width for wide session names", () => {
		const width = 93;
		const session = createSession({ sessionName: "한글".repeat(30) });
		const footer = new FooterComponent(session, createFooterData(1));

		const lines = footer.render(width);
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
	});

	it("keeps stats line within width for wide model and provider names", () => {
		const width = 60;
		const session = createSession({
			sessionName: "",
			modelId: "模".repeat(30),
			provider: "공급자",
			reasoning: true,
			thinkingLevel: "high",
			usage: {
				input: 12_345,
				output: 6_789,
				cacheRead: 0,
				cacheWrite: 0,
				cost: { total: 1.234 },
			},
		});
		const footer = new FooterComponent(session, createFooterData(2));

		const lines = footer.render(width);
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
	});

	it("renders core Maestro status independently from extension status", () => {
		const footerData = createFooterData(1);
		const footer = new FooterComponent(createSession({ sessionName: "" }), {
			...footerData,
			getCoreStatuses: () => new Map([["maestro", "MAESTRO ◆ 2 live / 1 input"]]),
			getExtensionStatuses: () => new Map([["extension", "extension-ready"]]),
		});

		const renderedStatusLine = footer.render(120)[2];
		const statusLine = stripAnsi(renderedStatusLine);
		expect(renderedStatusLine).toContain(theme.fg("borderMuted", "MAESTRO: 2 live / 1 input"));
		expect(statusLine).toContain("MAESTRO: 2 live / 1 input");
		expect(statusLine).toContain("extension-ready");
	});

	it("places Kioku before MCP and restores the MCP colon", () => {
		const footer = new FooterComponent(createSession({ sessionName: "" }), {
			...createFooterData(1),
			getExtensionStatuses: () =>
				new Map([
					["mcp", "\u001b[38;5;214mMCP 0/1\u001b[39m"],
					["recode-memory", "Kioku (記憶): project"],
				]),
		});

		const renderedStatusLine = footer.render(120)[2];
		const statusLine = stripAnsi(renderedStatusLine);
		expect(statusLine).toBe("Kioku (記憶): project  MCP: 0/1");
		expect(renderedStatusLine).toContain(theme.fg("warning", "MCP: 0/1"));
	});

	it("uses the core warning color while any MCP server is connecting", () => {
		const footer = new FooterComponent(createSession({ sessionName: "" }), {
			...createFooterData(1),
			getExtensionStatuses: () =>
				new Map([["mcp", "\u001b[38;5;214mMCP: connecting to community-server...\u001b[39m"]]),
		});

		const renderedStatusLine = footer.render(120)[2];
		expect(renderedStatusLine).toContain(theme.fg("warning", "MCP: connecting to community-server..."));
		expect(stripAnsi(renderedStatusLine)).toContain("MCP: connecting to community-server...");
	});

	it("normalizes the MCP adapter default to compact status", () => {
		const footer = new FooterComponent(createSession({ sessionName: "" }), {
			...createFooterData(1),
			getExtensionStatuses: () =>
				new Map([
					["mcp", "\u001b[38;5;214m🔌 MCP: 1 server enabled (1 connected)\u001b[39m"],
					["recode-memory", "Kioku (記憶): project"],
				]),
		});

		const statusLine = stripAnsi(footer.render(120)[2]);
		expect(statusLine).toBe("Kioku (記憶): project  MCP: 1/1");
	});

	it("colors pricing with the true green success status", () => {
		const footer = new FooterComponent(
			createSession({
				sessionName: "",
				usage: {
					input: 100,
					output: 10,
					cacheRead: 0,
					cacheWrite: 0,
					cost: { total: 3.088 },
				},
			}),
			createFooterData(1),
		);

		const statsLine = footer.render(120)[1];
		expect(statsLine).toContain(theme.fg("toolSuccessStatus", "$3.088"));
	});

	it("shows the latest cache hit rate when cache usage is present", () => {
		const session = createSession({
			sessionName: "",
			usage: {
				input: 100,
				output: 10,
				cacheRead: 50,
				cacheWrite: 50,
				cost: { total: 0.001 },
			},
		});
		const footer = new FooterComponent(session, createFooterData(1));

		const statsLine = stripAnsi(footer.render(120)[1]);
		expect(statsLine).toContain("CH25.0%");
	});

	it("colors token traffic and current-context percentage with the accent", () => {
		const footer = new FooterComponent(
			createSession({
				sessionName: "",
				usage: {
					input: 12_345,
					output: 678,
					cacheRead: 5_000,
					cacheWrite: 1_000,
					cost: { total: 0 },
				},
			}),
			createFooterData(1),
		);
		const statsLine = footer.render(120)[1];

		expect(statsLine).toContain(theme.fg("accent", "↑12k"));
		expect(statsLine).toContain(theme.fg("accent", "↓678"));
		expect(statsLine).toContain(theme.fg("accent", "R5.0k"));
		expect(statsLine).toContain(theme.fg("accent", "W1.0k"));
		expect(statsLine).toContain(theme.fg("accent", "CH27.3%"));
		expect(statsLine).toContain(theme.fg("accent", "ctx 25k 12.3%"));
		expect(stripAnsi(statsLine)).toContain("↑12k ↓678 R5.0k W1.0k CH27.3% ctx 25k 12.3%");
		expect(stripAnsi(statsLine)).not.toContain("200k");
		expect(stripAnsi(statsLine)).not.toContain("compact?");
	});

	it("suggests compaction at forty percent context usage", () => {
		const belowThreshold = new FooterComponent(
			createSession({ sessionName: "", contextPercent: 39.9 }),
			createFooterData(1),
		);
		const unavailable = new FooterComponent(
			createSession({ sessionName: "", contextPercent: 45, compactionAvailable: false }),
			createFooterData(1),
		);
		const footer = new FooterComponent(
			createSession({ sessionName: "", contextPercent: 40, compactionAvailable: true }),
			createFooterData(1),
		);
		const statsLine = footer.render(120)[1];

		expect(stripAnsi(belowThreshold.render(120)[1])).not.toContain("compact?");
		expect(stripAnsi(unavailable.render(120)[1])).not.toContain("compact?");
		expect(statsLine).toContain(theme.fg("accent", "ctx 25k 40.0% (compact?)"));
		expect(stripAnsi(statsLine)).toContain("ctx 25k 40.0% (compact?)");
	});
});
