import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ensureFileOpen, getOrCreateClient, sendRequest, shutdownAllLspClients } from "../src/lsp/client.ts";
import { loadLspConfig } from "../src/lsp/config.ts";
import { fileToUri } from "../src/lsp/utils.ts";

const runRealServers = process.env.REPI_REAL_LSP_TESTS === "1";
const require = createRequire(import.meta.url);
const tsserverPath = require.resolve("typescript/lib/tsserver.js");

interface RealServerCase {
	name: string;
	file: string;
	content: string;
	markers: Record<string, string>;
}

const cases: RealServerCase[] = [
	{
		name: "typescript-language-server",
		file: "src/index.ts",
		content: "export function answer(): number { return 42; }\n",
		markers: {
			"package.json": '{"name":"repi-lsp-smoke","private":true}',
			"tsconfig.json": '{"compilerOptions":{"strict":true},"include":["src"]}',
		},
	},
	{
		name: "rust-analyzer",
		file: "src/lib.rs",
		content: "pub fn answer() -> i32 { 42 }\n",
		markers: { "Cargo.toml": '[package]\nname = "repi_lsp_smoke"\nversion = "0.1.0"\nedition = "2024"\n' },
	},
	{
		name: "pyright",
		file: "src/main.py",
		content: "def answer() -> int:\n    return 42\n",
		markers: {
			"pyproject.toml": '[project]\nname = "repi-lsp-smoke"\nversion = "0.1.0"\nrequires-python = ">=3.10"\n',
		},
	},
	{
		name: "gopls",
		file: "main.go",
		content: "package main\n\nfunc answer() int { return 42 }\nfunc main() {}\n",
		markers: { "go.mod": "module example.com/repi-lsp-smoke\n\ngo 1.24\n" },
	},
];

afterEach(async () => {
	await shutdownAllLspClients();
});

describe("real language-server compatibility", () => {
	for (const fixture of cases) {
		test.runIf(runRealServers)(
			`${fixture.name} initializes, opens a document, and returns symbols`,
			async () => {
				const root = mkdtempSync(join(tmpdir(), `repi-real-${fixture.name}-`));
				for (const [relativePath, content] of Object.entries(fixture.markers)) {
					writeFileSync(join(root, relativePath), content);
				}
				const filePath = join(root, fixture.file);
				mkdirSync(dirname(filePath), { recursive: true });
				writeFileSync(filePath, fixture.content);
				const config = loadLspConfig(root, join(root, ".agent"));
				const server = config.servers[fixture.name];
				expect(server, `${fixture.name} was not detected on PATH`).toBeDefined();
				if (!server) return;
				if (fixture.name === "typescript-language-server") {
					server.initOptions = {
						...server.initOptions,
						tsserver: { path: tsserverPath },
					};
				}

				const client = await getOrCreateClient(server, root, { initializeTimeoutMs: 20_000 });
				await ensureFileOpen(client, filePath);
				const symbols = await sendRequest(
					client,
					"textDocument/documentSymbol",
					{ textDocument: { uri: fileToUri(filePath) } },
					undefined,
					20_000,
				);
				expect(Array.isArray(symbols)).toBe(true);
				expect((symbols as unknown[]).length).toBeGreaterThan(0);
			},
			30_000,
		);
	}
});
