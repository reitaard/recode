import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getServersForFile, loadLspConfig } from "../src/lsp/config.ts";

function installLocalCommand(root: string, command: string): void {
	const binDir = join(root, "node_modules", ".bin");
	mkdirSync(binDir, { recursive: true });
	const executable = join(binDir, process.platform === "win32" ? `${command}.cmd` : command);
	writeFileSync(executable, process.platform === "win32" ? "@exit /b 0\r\n" : "#!/bin/sh\nexit 0\n");
	if (process.platform !== "win32") chmodSync(executable, 0o755);
}

describe("LSP configuration", () => {
	test("detects the upstream TypeScript default from a project-local binary", () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-config-"));
		const agentDir = join(root, "agent");
		writeFileSync(join(root, "package.json"), "{}\n");
		installLocalCommand(root, "typescript-language-server");

		const config = loadLspConfig(root, agentDir);
		const server = config.servers["typescript-language-server"];
		expect(server?.args).toEqual(["--stdio"]);
		expect(server?.resolvedCommand).toContain("typescript-language-server");
		expect(getServersForFile(config, join(root, "src", "index.ts"))[0]?.[0]).toBe("typescript-language-server");
	});

	test("honors Recode user configuration overrides", () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-config-"));
		const agentDir = join(root, "agent");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(root, "package.json"), "{}\n");
		installLocalCommand(root, "typescript-language-server");
		writeFileSync(
			join(agentDir, "lsp.json"),
			JSON.stringify({ servers: { "typescript-language-server": { disabled: true } } }),
		);

		expect(loadLspConfig(root, agentDir).servers["typescript-language-server"]).toBeUndefined();
	});

	test("applies global, per-server, and lspmux controls", () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-controls-"));
		const agentDir = join(root, "agent");
		writeFileSync(join(root, "package.json"), "{}\n");
		installLocalCommand(root, "typescript-language-server");

		expect(loadLspConfig(root, agentDir, { enabled: false }).servers).toEqual({});
		expect(
			loadLspConfig(root, agentDir, { servers: { "typescript-language-server": false } }).servers[
				"typescript-language-server"
			],
		).toBeUndefined();
		expect(loadLspConfig(root, agentDir, { lspmux: false }).servers["typescript-language-server"]?.useLspmux).toBe(
			false,
		);
	});

	test("excludes linter servers from semantic file routing", () => {
		const config = {
			servers: {
				semantic: { command: "semantic", fileTypes: [".ts"], rootMarkers: ["package.json"] },
				biome: {
					command: "biome",
					fileTypes: [".ts"],
					rootMarkers: ["biome.json"],
					isLinter: true,
				},
			},
		};

		expect(getServersForFile(config, "src/index.ts").map(([name]) => name)).toEqual(["semantic", "biome"]);
		expect(getServersForFile(config, "src/index.ts", { includeLinters: false }).map(([name]) => name)).toEqual([
			"semantic",
		]);
	});
});
