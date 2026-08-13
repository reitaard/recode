import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { applyTextEditsToString, applyWorkspaceEdit } from "../src/lsp/edits.ts";
import { fileToUri } from "../src/lsp/utils.ts";

describe("LSP workspace edits", () => {
	test("applies multiple text edits from bottom to top", () => {
		expect(
			applyTextEditsToString("alpha\nbeta\ngamma\n", [
				{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "one" },
				{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } }, newText: "three" },
			]),
		).toBe("one\nbeta\nthree\n");
	});

	test("rejects overlapping workspace edits before writing", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-edits-"));
		const filePath = join(root, "sample.ts");
		writeFileSync(filePath, "abcdef\n");
		await expect(
			applyWorkspaceEdit(
				{
					changes: {
						[fileToUri(filePath)]: [
							{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } }, newText: "x" },
							{ range: { start: { line: 0, character: 2 }, end: { line: 0, character: 6 } }, newText: "y" },
						],
					},
				},
				root,
			),
		).rejects.toThrow("Overlapping LSP edits");
		expect(readFileSync(filePath, "utf-8")).toBe("abcdef\n");
	});

	test("project-only rejects outside edits before any file is changed", async () => {
		const parent = mkdtempSync(join(tmpdir(), "repi-lsp-boundary-"));
		const root = join(parent, "project");
		mkdirSync(root);
		const insidePath = join(root, "inside.ts");
		const outsidePath = join(parent, "outside.ts");
		writeFileSync(insidePath, "inside\n");
		writeFileSync(outsidePath, "outside\n");

		await expect(
			applyWorkspaceEdit(
				{
					changes: {
						[fileToUri(insidePath)]: [
							{
								range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
								newText: "changed",
							},
						],
						[fileToUri(outsidePath)]: [
							{
								range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
								newText: "escaped",
							},
						],
					},
				},
				root,
				{ projectOnly: true },
			),
		).rejects.toThrow("outside the project");
		expect(readFileSync(insidePath, "utf-8")).toBe("inside\n");
		expect(readFileSync(outsidePath, "utf-8")).toBe("outside\n");
	});

	test("unrestricted mode keeps upstream-compatible outside edits", async () => {
		const parent = mkdtempSync(join(tmpdir(), "repi-lsp-unrestricted-"));
		const root = join(parent, "project");
		mkdirSync(root);
		const outsidePath = join(parent, "outside.ts");
		writeFileSync(outsidePath, "outside\n");

		await applyWorkspaceEdit(
			{
				changes: {
					[fileToUri(outsidePath)]: [
						{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } }, newText: "allowed" },
					],
				},
			},
			root,
		);
		expect(readFileSync(outsidePath, "utf-8")).toBe("allowed\n");
	});
});
