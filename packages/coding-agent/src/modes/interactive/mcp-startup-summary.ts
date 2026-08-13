import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

interface McpConfigShape {
	mcpServers?: Record<string, unknown>;
}

function readServerNames(configPath: string): string[] {
	if (!existsSync(configPath)) return [];
	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as McpConfigShape;
		return Object.keys(parsed.mcpServers ?? {});
	} catch {
		return [];
	}
}

export function getConfiguredMcpServerNames(cwd: string, agentDir: string, homeDir = homedir()): string[] {
	const configPaths = [
		join(homeDir, ".config", "mcp", "mcp.json"),
		join(agentDir, "mcp.json"),
		resolve(cwd, ".mcp.json"),
		resolve(cwd, ".pi", "mcp.json"),
	];
	return [...new Set(configPaths.flatMap(readServerNames))].sort((a, b) => a.localeCompare(b));
}
