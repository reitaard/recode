import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	ensureFileOpen,
	getOrCreateClient,
	notifySaved,
	refreshFile,
	sendNotification,
	sendRequest,
	shutdownAllLspClients,
	syncContent,
	waitForProjectReady,
} from "../src/lsp/client.ts";
import { fileToUri } from "../src/lsp/utils.ts";

function createFakeServer(root: string): string {
	const serverPath = join(root, "fake-lsp.mjs");
	writeFileSync(
		serverPath,
		String.raw`
let pending = Buffer.alloc(0);
const received = [];
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
    if (!match) { pending = pending.subarray(headerEnd + 4); continue; }
    const start = headerEnd + 4;
    const end = start + Number(match[1]);
    if (pending.length < end) return;
    const message = JSON.parse(pending.subarray(start, end).toString());
    pending = pending.subarray(end);
    received.push({ method: message.method, params: message.params });
    if (message.method === "initialize") send({ jsonrpc: "2.0", id: message.id, result: { capabilities: { hoverProvider: true } } });
    if (message.method === "test/getMessages") send({ jsonrpc: "2.0", id: message.id, result: received });
    if (message.method === "textDocument/didOpen") send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: message.params.textDocument.uri, version: 1, diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 2, message: "test warning" }] } });
    if (message.method === "test/publishDiagnostics") {
      send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: message.params });
      send({ jsonrpc: "2.0", id: message.id, result: null });
    }
    if (message.method === "test/startProgress") {
      send({ jsonrpc: "2.0", method: "$/progress", params: { token: "index", value: { kind: "begin", title: "Indexing" } } });
      send({ jsonrpc: "2.0", id: message.id, result: null });
      setTimeout(() => send({ jsonrpc: "2.0", method: "$/progress", params: { token: "index", value: { kind: "end" } } }), 60);
    }
    if (message.method === "shutdown") send({ jsonrpc: "2.0", id: message.id, result: null });
    if (message.method === "exit") process.exit(0);
  }
});
`,
	);
	return serverPath;
}

function createFailingServer(root: string): string {
	const serverPath = join(root, "failing-lsp.mjs");
	writeFileSync(serverPath, `process.stderr.write("fake startup failure\\n"); setTimeout(() => process.exit(3), 10);`);
	return serverPath;
}

function createSlowServer(root: string): string {
	const serverPath = join(root, "slow-lsp.mjs");
	writeFileSync(serverPath, `process.stdin.resume(); setTimeout(() => {}, 30_000);`);
	return serverPath;
}

afterEach(async () => {
	await shutdownAllLspClients();
});

describe("LSP client", () => {
	test("deduplicates concurrent startup and synchronizes documents", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-client-"));
		const serverPath = createFakeServer(root);
		const sourcePath = join(root, "sample.ts");
		writeFileSync(sourcePath, "const value = 1;\n");
		const config = {
			command: process.execPath,
			args: [serverPath],
			fileTypes: [".ts"],
			useLspmux: false,
			settings: { typescript: { preferences: { quoteStyle: "single" } } },
		};

		const [first, second] = await Promise.all([getOrCreateClient(config, root), getOrCreateClient(config, root)]);
		expect(first).toBe(second);
		expect(first.state).toBe("ready");
		expect(first.serverCapabilities).toEqual({ hoverProvider: true });
		const startupMessages = (await sendRequest(first, "test/getMessages", {})) as Array<{
			method: string;
			params?: unknown;
		}>;
		expect(startupMessages).toContainEqual({
			method: "workspace/didChangeConfiguration",
			params: { settings: config.settings },
		});

		await ensureFileOpen(first, sourcePath);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(first.diagnostics.get(fileToUri(sourcePath))?.diagnostics[0]?.message).toBe("test warning");

		await syncContent(first, sourcePath, "const value = 2;\n");
		await notifySaved(first, sourcePath);
		expect(first.openFiles.get(fileToUri(sourcePath))?.version).toBe(2);
	});

	test("serializes concurrent writes in invocation order", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-write-queue-"));
		const client = await getOrCreateClient(
			{ command: process.execPath, args: [createFakeServer(root)], fileTypes: [".ts"], useLspmux: false },
			root,
		);
		await Promise.all(
			Array.from({ length: 50 }, (_, sequence) => sendNotification(client, "test/sequence", { sequence })),
		);
		const messages = (await sendRequest(client, "test/getMessages", {})) as Array<{
			method: string;
			params?: { sequence?: number };
		}>;
		expect(
			messages.filter((message) => message.method === "test/sequence").map((message) => message.params?.sequence),
		).toEqual(Array.from({ length: 50 }, (_, sequence) => sequence));
	});

	test("handles child stdin errors without an uncaught exception", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-stdin-error-"));
		const client = await getOrCreateClient(
			{ command: process.execPath, args: [createFakeServer(root)], fileTypes: [".ts"], useLspmux: false },
			root,
		);
		const pipeError = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

		expect(() => client.process.stdin.emit("error", pipeError)).not.toThrow();
		expect(client.state).toBe("error");
		await expect(sendNotification(client, "test/afterPipeError", {})).rejects.toThrow("not accepting messages");
	});

	test("waits for announced project indexing progress to finish", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-progress-"));
		const client = await getOrCreateClient(
			{ command: process.execPath, args: [createFakeServer(root)], fileTypes: [".ts"], useLspmux: false },
			root,
		);
		await sendRequest(client, "test/startProgress", {});
		expect(client.activeProgressTokens.has("index")).toBe(true);

		await waitForProjectReady(client);

		expect(client.activeProgressTokens.size).toBe(0);
	});

	test("refreshes an open document after an external file change", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-refresh-"));
		const sourcePath = join(root, "sample.ts");
		writeFileSync(sourcePath, "const value = 1;\n");
		const client = await getOrCreateClient(
			{ command: process.execPath, args: [createFakeServer(root)], fileTypes: [".ts"], useLspmux: false },
			root,
		);
		await ensureFileOpen(client, sourcePath);
		writeFileSync(sourcePath, "const value = 2;\n");

		await refreshFile(client, sourcePath);

		const opened = client.openFiles.get(fileToUri(sourcePath));
		expect(opened?.version).toBe(2);
		expect(opened?.content).toBe("const value = 2;\n");
		const messages = (await sendRequest(client, "test/getMessages", {})) as Array<{
			method: string;
			params?: { contentChanges?: Array<{ text?: string }> };
		}>;
		expect(messages).toContainEqual(
			expect.objectContaining({
				method: "textDocument/didChange",
				params: expect.objectContaining({ contentChanges: [{ text: "const value = 2;\n" }] }),
			}),
		);
	});

	test("cancels an in-flight language-server request", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-cancel-"));
		const client = await getOrCreateClient(
			{ command: process.execPath, args: [createFakeServer(root)], fileTypes: [".ts"], useLspmux: false },
			root,
		);
		const controller = new AbortController();
		const pending = sendRequest(client, "test/slow", {}, controller.signal, 5000);
		controller.abort(new Error("cancelled by test"));

		await expect(pending).rejects.toThrow("cancelled by test");
		await new Promise((resolve) => setTimeout(resolve, 20));
		const messages = (await sendRequest(client, "test/getMessages", {})) as Array<{ method: string }>;
		expect(messages.some((message) => message.method === "$/cancelRequest")).toBe(true);
	});

	test("ignores diagnostics published for an older document version", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-stale-diagnostics-"));
		const sourcePath = join(root, "sample.ts");
		writeFileSync(sourcePath, "const value = 1;\n");
		const client = await getOrCreateClient(
			{ command: process.execPath, args: [createFakeServer(root)], fileTypes: [".ts"], useLspmux: false },
			root,
		);
		await ensureFileOpen(client, sourcePath);
		await syncContent(client, sourcePath, "const value = 2;\n");
		const uri = fileToUri(sourcePath);
		await sendRequest(client, "test/publishDiagnostics", {
			uri,
			version: 1,
			diagnostics: [
				{
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
					severity: 1,
					message: "stale error",
				},
			],
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(client.diagnostics.get(uri)).toBeUndefined();
	});

	test("includes captured stderr when initialization fails", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-stderr-"));
		await expect(
			getOrCreateClient(
				{ command: process.execPath, args: [createFailingServer(root)], fileTypes: [".ts"], useLspmux: false },
				root,
			),
		).rejects.toThrow("fake startup failure");
	});

	test("stops a server that is still initializing", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-initializing-"));
		const creation = getOrCreateClient(
			{ command: process.execPath, args: [createSlowServer(root)], fileTypes: [".ts"], useLspmux: false },
			root,
		);
		await new Promise((resolve) => setTimeout(resolve, 30));
		await shutdownAllLspClients();
		await expect(creation).rejects.toThrow("stopped during initialization");
	});
});
