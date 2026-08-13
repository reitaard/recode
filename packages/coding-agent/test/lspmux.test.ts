import { describe, expect, test } from "vitest";
import { isLspmuxSupported, wrapWithLspmux } from "../src/lsp/lspmux.ts";

const running = { available: true, running: true, binaryPath: "/usr/bin/lspmux" };

describe("lspmux command wrapping", () => {
	test("keeps the upstream rust-analyzer-only allowlist", () => {
		expect(isLspmuxSupported("rust-analyzer")).toBe(true);
		expect(isLspmuxSupported("C:\\tools\\rust-analyzer.exe")).toBe(true);
		expect(isLspmuxSupported("typescript-language-server")).toBe(false);
	});

	test("uses lspmux for the default rust-analyzer command", () => {
		expect(wrapWithLspmux("rust-analyzer", [], running)).toEqual({ command: "/usr/bin/lspmux", args: [] });
	});

	test("falls back to direct spawning when lspmux is unavailable", () => {
		expect(
			wrapWithLspmux("rust-analyzer", ["--stdio"], {
				available: false,
				running: false,
				binaryPath: null,
			}),
		).toEqual({ command: "rust-analyzer", args: ["--stdio"] });
	});

	test("falls back when installed but its daemon is not running", () => {
		expect(
			wrapWithLspmux("rust-analyzer", [], {
				available: true,
				running: false,
				binaryPath: "/usr/bin/lspmux",
			}),
		).toEqual({ command: "rust-analyzer", args: [] });
	});

	test("preserves explicit rust-analyzer commands and arguments", () => {
		expect(wrapWithLspmux("/opt/rust-analyzer", ["--stdio"], running)).toEqual({
			command: "/usr/bin/lspmux",
			args: ["client", "--", "--stdio"],
			env: { LSPMUX_SERVER: "/opt/rust-analyzer" },
		});
	});
});
