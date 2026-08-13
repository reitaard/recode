import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getConfiguredMcpServerNames } from "../src/modes/interactive/mcp-startup-summary.ts";

describe("getConfiguredMcpServerNames", () => {
	test("returns no servers when MCP configuration is absent", () => {
		const root = mkdtempSync(join(tmpdir(), "repi-mcp-empty-"));
		expect(getConfiguredMcpServerNames(join(root, "project"), join(root, "agent"), root)).toEqual([]);
	});

	test("merges global and project server names without duplicates", () => {
		const root = mkdtempSync(join(tmpdir(), "repi-mcp-config-"));
		const project = join(root, "project");
		const agentDir = join(root, "agent");
		mkdirSync(join(project, ".pi"), { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "mcp.json"), JSON.stringify({ mcpServers: { context7: {}, github: {} } }));
		writeFileSync(join(project, ".pi", "mcp.json"), JSON.stringify({ mcpServers: { github: {}, playwright: {} } }));

		expect(getConfiguredMcpServerNames(project, agentDir, root)).toEqual(["context7", "github", "playwright"]);
	});
});
