import { describe, expect, it } from "vitest";
import { executeBashWithOperations } from "../src/core/bash-executor.ts";

function createOperations(chunks: string[]) {
	return {
		exec: async (_command: string, _cwd: string, options: { onData: (data: Buffer) => void }) => {
			for (const chunk of chunks) options.onData(Buffer.from(chunk));
			return { exitCode: 0 };
		},
	};
}

describe("executeBashWithOperations ANSI output", () => {
	it("preserves streamed SGR colors while discarding unsafe terminal controls", async () => {
		const result = await executeBashWithOperations(
			"rg --color=always name package.json",
			process.cwd(),
			createOperations(["\u001b[3", "1mname\u001b[0m \u001b[2Jclear\n"]),
		);

		expect(result.output).toBe("\u001b[31mname\u001b[0m clear\n");
	});
});
