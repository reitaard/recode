import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { shutdownAllLspClients } from "../src/lsp/client.ts";
import { clearAllLspDiagnosticSnapshots, waitForLspDiagnosticSnapshot } from "../src/lsp/diagnostics.ts";
import { createLspWritethrough } from "../src/lsp/writethrough.ts";

function createFakeServer(root: string, diagnosticDelayMs = 0): string {
	const serverPath = join(root, "fake-writethrough-lsp.mjs");
	writeFileSync(
		serverPath,
		String.raw`
let pending = Buffer.alloc(0);
function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\r\n\r\n" + body);
}
process.stdin.on("data", chunk => {
  pending = Buffer.concat([pending, chunk]);
  while (true) {
    const headerEnd = pending.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const match = /Content-Length:\s*(\d+)/i.exec(pending.subarray(0, headerEnd).toString());
    if (!match) return;
    const start = headerEnd + 4;
    const end = start + Number(match[1]);
    if (pending.length < end) return;
    const message = JSON.parse(pending.subarray(start, end).toString());
    pending = pending.subarray(end);
    if (message.method === "initialize") send({ jsonrpc: "2.0", id: message.id, result: { capabilities: {} } });
    if (message.method === "textDocument/didChange") {
      send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: message.params.textDocument.uri, version: message.params.textDocument.version - 1, diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, severity: 1, source: "fake", message: "stale error" }] } });
      setTimeout(() => send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: message.params.textDocument.uri, version: message.params.textDocument.version, diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, severity: 2, source: "fake", message: "fresh warning" }] } }), ${diagnosticDelayMs});
    }
    if (message.method === "shutdown") send({ jsonrpc: "2.0", id: message.id, result: null });
    if (message.method === "exit") process.exit(0);
  }
});
`,
	);
	return serverPath;
}

afterEach(async () => {
	await shutdownAllLspClients();
	clearAllLspDiagnosticSnapshots();
});

describe("LSP writethrough", () => {
	test("waits for diagnostics matching the changed document version", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-writethrough-"));
		const serverPath = createFakeServer(root);
		const filePath = join(root, "sample.ts");
		writeFileSync(join(root, "package.json"), "{}\n");
		writeFileSync(filePath, "const value = 2;\n");
		mkdirSync(join(root, ".pi"));
		writeFileSync(
			join(root, ".pi", "lsp.json"),
			JSON.stringify({
				servers: {
					"typescript-language-server": { disabled: true },
					fake: {
						command: process.execPath,
						args: [serverPath],
						fileTypes: [".ts"],
						rootMarkers: ["package.json"],
						useLspmux: false,
					},
				},
			}),
		);

		const result = await createLspWritethrough(root)(filePath, "const value = 2;\n");
		expect(result).toBeDefined();
		const snapshot = await waitForLspDiagnosticSnapshot(root, filePath, { timeoutMs: 5000 });
		expect(snapshot?.state).toBe("ready");
		expect(snapshot?.entries).toHaveLength(1);
		expect(snapshot?.entries[0]?.diagnostic.message).toBe("fresh warning");
		expect(snapshot?.entries[0]?.diagnostic.message).not.toBe("stale error");
		if (!result?.checking) {
			expect(result?.summary).toBe("LSP: 1 warning");
			expect(result?.messages.join("\n")).toContain("fresh warning");
		}
	});

	test("includes diagnostics that arrive within the inline budget", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-writethrough-inline-"));
		const serverPath = createFakeServer(root, 750);
		const filePath = join(root, "sample.ts");
		writeFileSync(join(root, "package.json"), "{}\n");
		writeFileSync(filePath, "const value = 2;\n");
		mkdirSync(join(root, ".pi"));
		writeFileSync(
			join(root, ".pi", "lsp.json"),
			JSON.stringify({
				servers: {
					"typescript-language-server": { disabled: true },
					fake: {
						command: process.execPath,
						args: [serverPath],
						fileTypes: [".ts"],
						rootMarkers: ["package.json"],
						useLspmux: false,
					},
				},
			}),
		);

		const result = await createLspWritethrough(root)(filePath, "const value = 2;\n");
		expect(result?.summary).toBe("LSP: 1 warning");
		expect(result?.checking).toBe(false);
		expect(result?.messages.join("\n")).toContain("fresh warning");
	});

	test("returns after the inline budget and stores diagnostics published by a slow server", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-writethrough-slow-"));
		const serverPath = createFakeServer(root, 3200);
		const filePath = join(root, "sample.ts");
		writeFileSync(join(root, "package.json"), "{}\n");
		writeFileSync(filePath, "const value = 2;\n");
		mkdirSync(join(root, ".pi"));
		writeFileSync(
			join(root, ".pi", "lsp.json"),
			JSON.stringify({
				servers: {
					"typescript-language-server": { disabled: true },
					fake: {
						command: process.execPath,
						args: [serverPath],
						fileTypes: [".ts"],
						rootMarkers: ["package.json"],
						useLspmux: false,
					},
				},
			}),
		);

		const started = Date.now();
		const result = await createLspWritethrough(root)(filePath, "const value = 2;\n");
		expect(Date.now() - started).toBeLessThan(3800);
		expect(result?.summary).toBe("LSP: checking in background");
		expect(result?.checking).toBe(true);

		const snapshot = await waitForLspDiagnosticSnapshot(root, filePath, { timeoutMs: 2000 });
		expect(snapshot?.state).toBe("ready");
		expect(snapshot?.entries[0]?.diagnostic.message).toBe("fresh warning");
	});
});
