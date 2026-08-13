import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	beginLspDiagnostics,
	clearAllLspDiagnosticSnapshots,
	completeLspDiagnostics,
	filterLspDiagnostics,
	formatGroupedLspDiagnostics,
	getLspDiagnosticSnapshot,
	type LspDiagnosticEntry,
} from "../src/lsp/diagnostics.ts";

afterEach(() => {
	clearAllLspDiagnosticSnapshots();
});

function diagnostic(filePath: string, severity: 1 | 2, message: string): LspDiagnosticEntry {
	return {
		filePath,
		server: "fake",
		diagnostic: {
			range: { start: { line: severity, character: 2 }, end: { line: severity, character: 4 } },
			severity,
			source: "test",
			message,
		},
	};
}

describe("LSP diagnostic store and formatting", () => {
	test("rejects late diagnostics from an older file mutation", () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-diagnostic-generation-"));
		const filePath = join(root, "sample.ts");
		const first = beginLspDiagnostics(root, filePath);
		const second = beginLspDiagnostics(root, filePath);

		expect(completeLspDiagnostics(root, filePath, first, [diagnostic(filePath, 1, "stale")], [])).toBe(false);
		expect(completeLspDiagnostics(root, filePath, second, [diagnostic(filePath, 2, "fresh")], [])).toBe(true);
		expect(getLspDiagnosticSnapshot(root, filePath)?.entries[0]?.diagnostic.message).toBe("fresh");
	});

	test("groups diagnostics by file and severity", () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-diagnostic-group-"));
		const first = join(root, "src", "first.ts");
		const second = join(root, "src", "second.ts");
		const formatted = formatGroupedLspDiagnostics(
			[
				diagnostic(first, 2, "unused value"),
				diagnostic(first, 1, "missing name"),
				diagnostic(second, 1, "invalid return"),
			],
			root,
		);

		expect(formatted.summary).toBe("LSP: 2 errors, 1 warning");
		expect(formatted.messages.join("\n")).toContain(join("src", "first.ts"));
		expect(formatted.messages.join("\n")).toContain("1 error");
		expect(formatted.messages.join("\n")).toContain("1 warning");
	});

	test("filters diagnostic details without changing the stored snapshot", () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-diagnostic-filter-"));
		const filePath = join(root, "sample.ts");
		const entries = [diagnostic(filePath, 1, "type mismatch"), diagnostic(filePath, 2, "unused import")];

		expect(filterLspDiagnostics(entries, { severity: "warning" })).toHaveLength(1);
		expect(filterLspDiagnostics(entries, { query: "mismatch" })[0]?.diagnostic.message).toBe("type mismatch");
		expect(entries).toHaveLength(2);
	});

	test("bounds rendered output for a diagnostic-heavy workspace", () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-diagnostic-heavy-"));
		const filePath = join(root, "generated.ts");
		const entries = Array.from({ length: 5_000 }, (_, index) =>
			diagnostic(filePath, index % 2 === 0 ? 1 : 2, `generated issue ${index}`),
		);
		const formatted = formatGroupedLspDiagnostics(entries, root);

		expect(formatted.count).toBe(5_000);
		expect(formatted.messages.length).toBeLessThanOrEqual(54);
		expect(formatted.messages.at(-1)).toBe("... 4950 more diagnostics");
	});
});
