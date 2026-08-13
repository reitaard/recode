import { afterEach, describe, expect, it, vi } from "vitest";
import {
	prepareRecodeTerminalViewport,
	RecodeProcessTerminal,
	readCurrentWindowSize,
} from "../src/modes/interactive/recode-process-terminal.ts";

const originalStartupProbe = process.env.PI_STARTUP_PROBE;
const originalStartupInput = process.env.PI_STARTUP_BENCHMARK_INPUT;

afterEach(() => {
	for (const [name, value] of [
		["PI_STARTUP_PROBE", originalStartupProbe],
		["PI_STARTUP_BENCHMARK_INPUT", originalStartupInput],
	] as const) {
		if (value === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = value;
		}
	}
	vi.restoreAllMocks();
});

describe("re.code process terminal", () => {
	it("reads the live terminal dimensions instead of cached stdout fields", () => {
		expect(readCurrentWindowSize({ getWindowSize: () => [191, 47] })).toEqual([191, 47]);
	});

	it("falls back when live dimensions are unavailable", () => {
		expect(readCurrentWindowSize({ getWindowSize: () => [0, 0] })).toBeUndefined();
		expect(
			readCurrentWindowSize({
				getWindowSize: () => {
					throw new Error("terminal unavailable");
				},
			}),
		).toBeUndefined();
	});

	it("emits input echo only after the sentinel is written to the terminal", () => {
		process.env.PI_STARTUP_PROBE = "1";
		process.env.PI_STARTUP_BENCHMARK_INPUT = "__RECODE_STARTUP_ECHO__";
		vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const terminal = new RecodeProcessTerminal();

		terminal.write("unrelated render");
		expect(stderr).not.toHaveBeenCalled();
		terminal.write("editor: __RECODE_STARTUP_ECHO__");

		expect(stderr).toHaveBeenCalledTimes(1);
		expect(String(stderr.mock.calls[0]?.[0])).toContain('"name":"tui-input-echo"');
	});

	it("clears and homes the viewport before the first render", () => {
		const operations: string[] = [];
		prepareRecodeTerminalViewport({
			write: (data) => operations.push(`write:${data}`),
			clearScreen: () => operations.push("clearScreen"),
		});

		expect(operations).toEqual(["write:\x1b]111\x07", "clearScreen"]);
	});
});
