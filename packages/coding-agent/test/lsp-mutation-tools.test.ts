import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createEditToolDefinition } from "../src/core/tools/edit.ts";
import { createWriteToolDefinition } from "../src/core/tools/write.ts";
import type { LspWritethrough } from "../src/lsp/writethrough.ts";

function createWritethrough() {
	return vi.fn<LspWritethrough>(async () => ({
		summary: "LSP: 1 warning",
		messages: ["sample.ts:1:1 [warning] fake warning"],
		errored: false,
		servers: ["fake"],
	}));
}

describe("edit/write LSP writethrough", () => {
	test("synchronizes edit content and returns diagnostics", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-edit-"));
		const filePath = join(root, "sample.ts");
		writeFileSync(filePath, "const value = 1;\n");
		const writethrough = createWritethrough();
		const tool = createEditToolDefinition(root, { lspWritethrough: writethrough });
		const result = await tool.execute(
			"edit",
			{ path: "sample.ts", edits: [{ oldText: "1", newText: "2" }] },
			undefined,
			undefined,
			{} as never,
		);

		expect(readFileSync(filePath, "utf-8")).toBe("const value = 2;\n");
		expect(writethrough).toHaveBeenCalledWith(filePath, "const value = 2;\n", undefined);
		expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("fake warning");
	});

	test("synchronizes newly written content and returns diagnostics", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-write-"));
		const filePath = join(root, "sample.ts");
		const writethrough = createWritethrough();
		const tool = createWriteToolDefinition(root, { lspWritethrough: writethrough });
		const result = await tool.execute(
			"write",
			{ path: "sample.ts", content: "const value = 1;\n" },
			undefined,
			undefined,
			{} as never,
		);

		expect(readFileSync(filePath, "utf-8")).toBe("const value = 1;\n");
		expect(writethrough).toHaveBeenCalledWith(filePath, "const value = 1;\n", undefined);
		expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("LSP: 1 warning");
	});

	test("reports a committed edit as successful when diagnostics are cancelled", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-edit-cancel-"));
		const filePath = join(root, "sample.ts");
		writeFileSync(filePath, "const value = 1;\n");
		const controller = new AbortController();
		const writethrough = vi.fn<LspWritethrough>(async () => {
			controller.abort(new Error("cancelled after write"));
			throw controller.signal.reason;
		});
		const tool = createEditToolDefinition(root, { lspWritethrough: writethrough });
		const result = await tool.execute(
			"edit",
			{ path: "sample.ts", edits: [{ oldText: "1", newText: "2" }] },
			controller.signal,
			undefined,
			{} as never,
		);

		expect(readFileSync(filePath, "utf-8")).toBe("const value = 2;\n");
		expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("Successfully replaced");
		expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain(
			"diagnostics unavailable after successful write",
		);
	});

	test("reports a committed write as successful when diagnostics fail", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-write-cancel-"));
		const filePath = join(root, "sample.ts");
		const writethrough = vi.fn<LspWritethrough>(async () => {
			throw new Error("language server stopped");
		});
		const tool = createWriteToolDefinition(root, { lspWritethrough: writethrough });
		const result = await tool.execute(
			"write",
			{ path: "sample.ts", content: "const value = 1;\n" },
			undefined,
			undefined,
			{} as never,
		);

		expect(readFileSync(filePath, "utf-8")).toBe("const value = 1;\n");
		expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("Successfully wrote");
		expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain(
			"LSP unavailable: language server stopped",
		);
	});
});
