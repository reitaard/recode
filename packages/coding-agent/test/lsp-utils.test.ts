import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { commandBasename, detectLanguageId, fileToUri, uriToFile } from "../src/lsp/utils.ts";

describe("LSP cross-platform utilities", () => {
	test("round-trips native paths containing spaces and Unicode through file URIs", () => {
		const filePath = path.join(tmpdir(), "repi LSP", "café source.ts");
		expect(uriToFile(fileToUri(filePath))).toBe(path.resolve(filePath));
	});

	test("normalizes Unix and Windows executable names", () => {
		expect(commandBasename("/usr/local/bin/rust-analyzer")).toBe("rust-analyzer");
		expect(commandBasename("C:\\Tools\\typescript-language-server.cmd")).toBe("typescript-language-server");
		expect(commandBasename("C:\\Tools\\gopls.exe")).toBe("gopls");
	});

	test("maps primary compatibility languages to stable protocol identifiers", () => {
		expect(detectLanguageId("index.ts")).toBe("typescript");
		expect(detectLanguageId("main.rs")).toBe("rust");
		expect(detectLanguageId("main.py")).toBe("python");
		expect(detectLanguageId("main.go")).toBe("go");
	});
});
