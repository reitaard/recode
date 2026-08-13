import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	RecodeSessionControlClient,
	RecodeSessionControlHost,
	watchRecodeSessionTranscript,
} from "../src/core/recode-session-control.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Recode session control", () => {
	it("does not attach a process to its own session host", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "recode-session-control-"));
		tempDirs.push(agentDir);
		const host = new RecodeSessionControlHost(agentDir, "same-process", undefined, async () => {});

		await host.start();
		try {
			const client = await RecodeSessionControlClient.connect(agentDir, "same-process", () => {});
			expect(client).toBeUndefined();
		} finally {
			await host.stop();
		}
	});

	it("notifies when a resumed session transcript is appended", async () => {
		const directory = mkdtempSync(join(tmpdir(), "recode-session-transcript-"));
		tempDirs.push(directory);
		const sessionFile = join(directory, "session.jsonl");
		writeFileSync(sessionFile, '{"type":"session"}\n');
		const changed = vi.fn();
		const watcher = watchRecodeSessionTranscript(sessionFile, changed);

		try {
			appendFileSync(sessionFile, '{"type":"message"}\n');
			await vi.waitFor(() => expect(changed).toHaveBeenCalled());
		} finally {
			watcher.close();
		}
	});
});
