import { describe, expect, it } from "vitest";
import { resetRecodeTerminalBackground } from "../src/modes/interactive/recode-terminal-background.ts";

describe("re.code terminal background", () => {
	it("restores the terminal profile background", () => {
		const writes: string[] = [];
		const terminal = { write: (data: string) => writes.push(data) };

		resetRecodeTerminalBackground(terminal);

		expect(writes).toEqual(["\x1b]111\x07"]);
	});
});
