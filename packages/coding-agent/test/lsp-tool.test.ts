import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { shutdownAllLspClients } from "../src/lsp/client.ts";
import { createLspToolDefinition } from "../src/lsp/tool.ts";

function createFakeServer(root: string, options: { referencesRequireRetry?: boolean } = {}): string {
	const serverPath = join(root, "fake-tool-lsp.mjs");
	writeFileSync(
		serverPath,
		String.raw`
let pending = Buffer.alloc(0);
let rootUri = "";
let referenceRequests = 0;
const referencesRequireRetry = ${String(options.referencesRequireRetry ?? false)};
function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\r\n\r\n" + body);
}
function fileUri(name) {
  return rootUri.replace(/\/$/, "") + "/" + name;
}
function callItem(name, uri, detail) {
  return {
    name,
    kind: 12,
    detail,
    uri,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 11 } },
    selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } }
  };
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
    if (message.method === "initialize") {
      rootUri = message.params.rootUri;
      send({ jsonrpc: "2.0", id: message.id, result: { capabilities: { hoverProvider: true, definitionProvider: true, typeDefinitionProvider: true, implementationProvider: true, workspaceSymbolProvider: true, callHierarchyProvider: true, workspace: { fileOperations: { willRename: true, didRename: true } }, diagnosticProvider: { workspaceDiagnostics: true } } } });
    }
    if (message.method === "textDocument/didOpen") send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: message.params.textDocument.uri, version: 1, diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, severity: 2, message: "fake warning" }] } });
    if (message.method === "textDocument/didChange") send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: message.params.textDocument.uri, version: message.params.textDocument.version, diagnostics: [] } });
    if (message.method === "textDocument/hover") send({ jsonrpc: "2.0", id: message.id, result: { contents: { kind: "markdown", value: "fake hover" } } });
    if (message.method === "textDocument/definition") send({ jsonrpc: "2.0", id: message.id, result: { uri: fileUri("sample.ts"), range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } } } });
    if (message.method === "textDocument/references") {
      referenceRequests++;
      const declaration = { uri: fileUri("sample.ts"), range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } } };
      const result = message.params.position.character !== 6 ? [] : referencesRequireRetry && referenceRequests <= 2 ? [declaration] : [declaration, { uri: fileUri("consumer.ts"), range: { start: { line: 1, character: 3 }, end: { line: 1, character: 8 } } }];
      send({ jsonrpc: "2.0", id: message.id, result });
    }
    if (message.method === "textDocument/typeDefinition") send({ jsonrpc: "2.0", id: message.id, result: { uri: fileUri("types.ts"), range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } } } });
    if (message.method === "textDocument/implementation") send({ jsonrpc: "2.0", id: message.id, result: [{ targetUri: fileUri("implementation.ts"), targetSelectionRange: { start: { line: 4, character: 2 }, end: { line: 4, character: 7 } } }] });
    if (message.method === "workspace/symbol") send({ jsonrpc: "2.0", id: message.id, result: [{ name: "value", kind: 13, containerName: "sample", location: { uri: fileUri("sample.ts"), range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } } } }] });
    if (message.method === "textDocument/prepareCallHierarchy") send({ jsonrpc: "2.0", id: message.id, result: [callItem("value", fileUri("sample.ts"), "selected function")] });
    if (message.method === "callHierarchy/incomingCalls") send({ jsonrpc: "2.0", id: message.id, result: [{ from: callItem("caller", fileUri("consumer.ts"), "incoming"), fromRanges: [] }] });
    if (message.method === "callHierarchy/outgoingCalls") send({ jsonrpc: "2.0", id: message.id, result: [{ to: callItem("helper", fileUri("helper.ts"), "outgoing"), fromRanges: [] }] });
    if (message.method === "workspace/diagnostic") send({ jsonrpc: "2.0", id: message.id, result: { items: [{ uri: fileUri("sample.ts"), kind: "full", items: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, severity: 1, message: "workspace error" }] }] } });
    if (message.method === "workspace/willRenameFiles") send({ jsonrpc: "2.0", id: message.id, result: { changes: { [fileUri("consumer.ts")]: [{ range: { start: { line: 0, character: 19 }, end: { line: 0, character: 29 } }, newText: "\"./renamed\"" }] } } });
    if (message.method === "textDocument/formatting") send({ jsonrpc: "2.0", id: message.id, result: [{ range: { start: { line: 0, character: 14 }, end: { line: 0, character: 15 } }, newText: "2" }] });
    if (message.method === "textDocument/rename") send({ jsonrpc: "2.0", id: message.id, result: { changes: { [message.params.textDocument.uri]: [{ range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } }, newText: message.params.newName }] } } });
    if (message.method === "textDocument/codeAction") send({ jsonrpc: "2.0", id: message.id, result: [{ title: "Use let", isPreferred: true, edit: { changes: { [message.params.textDocument.uri]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "let  " }] } } }] });
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
});

describe("LSP tool", () => {
	test("read-only mode rejects mutation actions", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-readonly-"));
		const tool = createLspToolDefinition(root, { readOnly: true });
		await expect(
			tool.execute(
				"rename",
				{ action: "rename", file: "sample.ts", line: 1, character: 1, new_name: "next" },
				undefined,
				undefined,
				{} as never,
			),
		).rejects.toThrow("unavailable in a read-only tool set");
	});

	test("position-based actions reject silent line-one fallbacks", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-position-"));
		const tool = createLspToolDefinition(root);
		await expect(
			tool.execute("references", { action: "references", file: "sample.ts" }, undefined, undefined, {} as never),
		).rejects.toThrow("requires line and either symbol or character");
	});

	test("project-only mode rejects file queries outside the workspace", async () => {
		const parent = mkdtempSync(join(tmpdir(), "repi-lsp-project-only-"));
		const root = join(parent, "project");
		mkdirSync(root);
		const tool = createLspToolDefinition(root, { controls: { projectOnly: true } });
		await expect(
			tool.execute(
				"hover",
				{ action: "hover", file: "../outside.ts", line: 1, character: 1 },
				undefined,
				undefined,
				{} as never,
			),
		).rejects.toThrow("outside the project");
	});

	test("queries hover information and published diagnostics", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-tool-"));
		const serverPath = createFakeServer(root);
		const sourcePath = join(root, "sample.ts");
		writeFileSync(join(root, "package.json"), "{}\n");
		writeFileSync(sourcePath, "const value = 1;\n");
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
		const tool = createLspToolDefinition(root);

		const hover = await tool.execute(
			"hover",
			{ action: "hover", file: "sample.ts", line: 1, character: 1 },
			undefined,
			undefined,
			{} as never,
		);
		expect(hover.content[0]).toEqual({ type: "text", text: "fake hover" });

		const diagnostics = await tool.execute(
			"diagnostics",
			{ action: "diagnostics", file: "sample.ts" },
			undefined,
			undefined,
			{} as never,
		);
		expect(diagnostics.content[0]?.type === "text" ? diagnostics.content[0].text : "").toContain("fake warning");
	});

	test("queries definitions, implementations, workspace symbols, calls, and workspace diagnostics", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-navigation-"));
		const serverPath = createFakeServer(root);
		writeFileSync(join(root, "package.json"), "{}\n");
		writeFileSync(join(root, "sample.ts"), "const value = 1;\n");
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
		const tool = createLspToolDefinition(root);
		const execute = (input: Parameters<typeof tool.execute>[1]) =>
			tool.execute("navigation", input, undefined, undefined, {} as never);

		const definition = await execute({ action: "definition", file: "sample.ts", line: 1, character: 7 });
		expect(definition.content[0]).toEqual({
			type: "text",
			text: "1 definition found in 1 file:\nsample.ts:1:7\n  const value = 1;",
		});

		const typeDefinition = await execute({ action: "type_definition", file: "sample.ts", line: 1, character: 7 });
		expect(typeDefinition.content[0]).toEqual({
			type: "text",
			text: "1 type definition found in 1 file:\ntypes.ts:3:1",
		});

		const implementation = await execute({ action: "implementation", file: "sample.ts", line: 1, character: 7 });
		expect(implementation.content[0]).toEqual({
			type: "text",
			text: "1 implementation found in 1 file:\nimplementation.ts:5:3",
		});

		const references = await execute({ action: "references", file: "sample.ts", line: 1, symbol: "value" });
		expect(references.content[0]).toEqual({
			type: "text",
			text: '2 references found for "value" in 2 files:\nsample.ts:1:7\n  const value = 1;\nconsumer.ts:2:4',
		});
		expect(references.details?.locations).toEqual([
			{ file: "sample.ts", line: 1, character: 7, context: "const value = 1;" },
			{ file: "consumer.ts", line: 2, character: 4 },
		]);

		const workspaceSymbols = await execute({ action: "workspace_symbols", query: "value" });
		expect(workspaceSymbols.content[0]?.type === "text" ? workspaceSymbols.content[0].text : "").toContain(
			"value (sample) — sample.ts:1:7",
		);

		const hierarchy = await execute({ action: "call_hierarchy", file: "sample.ts", line: 1, character: 7 });
		expect(hierarchy.content[0]?.type === "text" ? hierarchy.content[0].text : "").toContain(
			"value — selected function",
		);

		const incoming = await execute({ action: "incoming_calls", file: "sample.ts", line: 1, character: 7 });
		expect(incoming.content[0]?.type === "text" ? incoming.content[0].text : "").toContain("← caller — incoming");

		const outgoing = await execute({ action: "outgoing_calls", file: "sample.ts", line: 1, character: 7 });
		expect(outgoing.content[0]?.type === "text" ? outgoing.content[0].text : "").toContain("→ helper — outgoing");

		const workspaceDiagnostics = await execute({ action: "workspace_diagnostics" });
		const workspaceDiagnosticText =
			workspaceDiagnostics.content[0]?.type === "text" ? workspaceDiagnostics.content[0].text : "";
		expect(workspaceDiagnosticText).toContain("LSP: 1 error");
		expect(workspaceDiagnosticText).toContain("sample.ts");
		expect(workspaceDiagnosticText).toContain("1:1 workspace error");
	});

	test("retries references while the project index only returns the declaration", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-reference-retry-"));
		const serverPath = createFakeServer(root, { referencesRequireRetry: true });
		writeFileSync(join(root, "package.json"), "{}\n");
		writeFileSync(join(root, "sample.ts"), "const value = 1;\n");
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
		const tool = createLspToolDefinition(root);

		const references = await tool.execute(
			"references",
			{ action: "references", file: "sample.ts", line: 1, symbol: "value" },
			undefined,
			undefined,
			{} as never,
		);

		expect(references.details?.locations).toHaveLength(2);
	});

	test("previews and applies formatting, rename, and code actions", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-tool-"));
		const serverPath = createFakeServer(root);
		const sourcePath = join(root, "sample.ts");
		writeFileSync(join(root, "package.json"), "{}\n");
		writeFileSync(sourcePath, "const value = 1;\n");
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
		const tool = createLspToolDefinition(root);
		const execute = (input: Parameters<typeof tool.execute>[1]) =>
			tool.execute("mutation", input, undefined, undefined, {} as never);

		const preview = await execute({ action: "format", file: "sample.ts" });
		expect(preview.content[0]?.type === "text" ? preview.content[0].text : "").toContain("+const value = 2;");
		expect(readFileSync(sourcePath, "utf-8")).toBe("const value = 1;\n");

		await execute({ action: "format", file: "sample.ts", apply: true });
		expect(readFileSync(sourcePath, "utf-8")).toBe("const value = 2;\n");

		const renamePreview = await execute({
			action: "rename",
			file: "sample.ts",
			line: 1,
			symbol: "value",
			new_name: "total",
		});
		expect(renamePreview.content[0]).toEqual({ type: "text", text: "Rename preview: 1 text edit" });
		await execute({ action: "rename", file: "sample.ts", line: 1, symbol: "value", new_name: "total", apply: true });
		expect(readFileSync(sourcePath, "utf-8")).toBe("const total = 2;\n");

		await execute({
			action: "code_actions",
			file: "sample.ts",
			line: 1,
			character: 0,
			query: "use let",
			apply: true,
		});
		expect(readFileSync(sourcePath, "utf-8")).toBe("let   total = 2;\n");
	});

	test("previews and applies a file rename with language-server import edits", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-file-rename-"));
		const serverPath = createFakeServer(root);
		const sourcePath = join(root, "sample.ts");
		const destinationPath = join(root, "renamed.ts");
		const consumerPath = join(root, "consumer.ts");
		writeFileSync(join(root, "package.json"), "{}\n");
		writeFileSync(sourcePath, "export const value = 1;\n");
		writeFileSync(consumerPath, 'const modulePath = "./sample";\n');
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
		const tool = createLspToolDefinition(root);
		const execute = (apply?: boolean) =>
			tool.execute(
				"rename-file",
				{ action: "rename_file", file: "sample.ts", new_name: "renamed.ts", apply },
				undefined,
				undefined,
				{} as never,
			);

		const preview = await execute();
		expect(preview.content[0]?.type === "text" ? preview.content[0].text : "").toContain(
			"1 text edit, 1 file operation",
		);
		expect(readFileSync(sourcePath, "utf-8")).toBe("export const value = 1;\n");

		await execute(true);
		expect(() => readFileSync(sourcePath, "utf-8")).toThrow();
		expect(readFileSync(destinationPath, "utf-8")).toBe("export const value = 1;\n");
		expect(readFileSync(consumerPath, "utf-8")).toBe('const modulePath = "./renamed";\n');
	});
});
