import { stripVTControlCharacters } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { RecodeHeader } from "../src/modes/interactive/components/recode-header.ts";
import { workerForeground } from "../src/modes/interactive/components/recode-worker-indicator.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";

describe("RecodeHeader", () => {
	beforeEach(() => initTheme("dark"));

	const createHeader = () =>
		new RecodeHeader(
			"0.81.0",
			() => "welcome",
			() => ({
				model: "qwen3.5-9b",
				provider: "open-provider",
				cwd: "re.pi",
				toolOutputKey: "Ctrl+O",
			}),
		);

	it("renders a full-width two-column welcome box", () => {
		const lines = createHeader().render(80).map(stripVTControlCharacters);

		expect(lines).toHaveLength(9);
		expect(lines[0]).toContain("re.pi v0.81.0");
		expect(lines[1]).toContain("Welcome to re™");
		expect(lines[1]).not.toContain("Welcome to re.pi");
		expect(lines[1]).toContain("Tips for getting started");
		expect(lines[3]).toContain("▄▀▀▀▀▀ █▀▀▀▀█ █▀▀▀▀▄ █▀▀▀▀▀");
		expect(lines[6]).toContain("qwen3.5-9b · open-provider");
		expect(lines.every((line) => line.length === 80)).toBe(true);
	});

	it("reflows into a single-column box at medium widths", () => {
		const lines = createHeader().render(64).map(stripVTControlCharacters);

		expect(lines).toHaveLength(9);
		expect(lines[1]).toContain("▄▀▀▀▀▀ █▀▀▀▀█ █▀▀▀▀▄ █▀▀▀▀▀");
		expect(lines[4]).toContain("qwen3.5-9b · open-provider");
		expect(lines[6]).toContain("/ commands · ! bash · Ctrl+O help");
		expect(lines.every((line) => line.length === 64)).toBe(true);
	});

	it("uses a compact brand below the boxed-layout breakpoint", () => {
		const lines = createHeader().render(40).map(stripVTControlCharacters);

		expect(lines).toEqual([expect.stringContaining("re™ CODE v0.81.0 · / commands")]);
		expect(lines[0]!.length).toBeLessThanOrEqual(40);
	});

	it("keeps one brand palette across light and dark themes", () => {
		const darkBrand = createHeader().render(40);
		initTheme("light");
		const lightBrand = createHeader().render(40);

		expect(lightBrand).toEqual(darkBrand);
	});

	it("recalculates its Yoga layout when a running terminal changes width", () => {
		const header = createHeader();

		const wide = header.render(80).map(stripVTControlCharacters);
		expect(wide).toHaveLength(9);
		expect(wide[1]).toContain("│ Tips for getting started");
		expect(header.render(64)).toHaveLength(9);
		expect(header.render(40)).toHaveLength(1);
		expect(header.render(80)).toHaveLength(9);
	});

	it("keeps the logo and replaces only helper content during direct worker chat", () => {
		const header = new RecodeHeader(
			"0.81.0",
			() => "welcome",
			() => ({
				model: "qwen3.5-9b",
				provider: "open-provider",
				cwd: "re.pi",
				toolOutputKey: "Ctrl+O",
				worker: {
					workerId: "research",
					workerName: "Mayuri (研究)",
					status: "ready",
					turnCount: 3,
					memoryDocumentCount: 7,
					sessionCount: 2,
					evaluationCount: 1,
				},
			}),
		);
		const rendered = header.render(100);
		const text = rendered.map(stripVTControlCharacters).join("\n");
		const styled = rendered.join("\n");

		expect(text).toContain("Welcome to re™");
		expect(text).toContain("▄▀▀▀▀▀ █▀▀▀▀█ █▀▀▀▀▄ █▀▀▀▀▀");
		expect(text).toContain("Direct chat · Mayuri (研究)");
		expect(text).toContain("Memory       7 documents");
		expect(text).toContain("Progress     2 sessions · 3 turns");
		expect(text).not.toContain("Tips for getting started");
		expect(styled).toContain(theme.fg("success", "ready"));
		expect(styled).toContain(theme.fg("accent", "7"));
		expect(styled).toContain(workerForeground("research", "text", " Memory       ", theme));
	});

	it("renders failed worker health in red", () => {
		const header = new RecodeHeader(
			"0.81.0",
			() => "welcome",
			() => ({
				model: "qwen3.5-9b",
				provider: "open-provider",
				cwd: "re.pi",
				toolOutputKey: "Ctrl+O",
				worker: {
					workerId: "audit",
					workerName: "Levi (監査)",
					status: "failed",
					turnCount: 0,
					memoryDocumentCount: 0,
					sessionCount: 0,
					evaluationCount: 0,
				},
			}),
		);

		expect(header.render(100).join("\n")).toContain(theme.fg("error", "failed"));
	});

	it("does not occupy rows outside the welcome state", () => {
		const header = new RecodeHeader("0.81.0", () => "hidden");
		expect(header.render(120)).toEqual([]);
	});
});
