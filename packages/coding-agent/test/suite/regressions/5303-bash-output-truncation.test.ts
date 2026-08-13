import type { ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, type Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { spawnProcess, waitForChildProcess } from "../../../src/utils/child-process.ts";

/**
 * Regression test for https://github.com/earendil-works/pi/issues/5303
 *
 * waitForChildProcess armed a fixed 100ms timer on `exit` and destroyed the
 * stdio streams when it fired. When a short-lived detached descendant kept the
 * stdout pipe open, `close` never fired, so that timer was the only thing that
 * resolved the wait, and any output written more than 100ms after exit was
 * binned. In practice every git commit whose pre-commit hook runs lint-staged
 * came back truncated mid-listr2 output, read by the model as a hang.
 *
 * The fix re-arms the grace on each chunk, so an actively writing pipe keeps us
 * reading while a genuinely idle held-open handle still releases after the
 * grace elapses. Both behaviours are covered below.
 */
function createSyntheticWindowsProcess(
	headOutput: string,
	delayedOutput: string | undefined,
): ChildProcessByStdio<null, Readable, Readable> {
	const child = new EventEmitter() as ChildProcessByStdio<null, Readable, Readable>;
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	Object.assign(child, { pid: undefined, stdout, stderr });

	setTimeout(() => {
		stdout.write(headOutput);
		child.emit("exit", 0);
		if (delayedOutput) {
			let tick = 1;
			const timer = setInterval(() => {
				stdout.write(tick === 6 ? delayedOutput : `TICK${tick}\\n`);
				if (tick === 6) {
					clearInterval(timer);
					stdout.end();
					stderr.end();
					child.emit("close", 0);
				}
				tick += 1;
			}, 50);
		}
	}, 0);
	return child;
}

function spawnRegressionProcess(
	command: string,
	headOutput: string,
	delayedOutput?: string,
): ChildProcessByStdio<null, Readable, Readable> {
	if (process.platform === "win32") {
		return createSyntheticWindowsProcess(headOutput, delayedOutput);
	}
	return spawnProcess("/bin/sh", ["-c", command], {
		stdio: ["ignore", "pipe", "pipe"],
		detached: true,
	}) as ChildProcessByStdio<null, Readable, Readable>;
}

describe("issue #5303 bash output truncation past exit", () => {
	let child: ChildProcessByStdio<null, Readable, Readable> | undefined;

	afterEach(() => {
		if (child?.pid && process.platform !== "win32") {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				// Already gone.
			}
		}
		child = undefined;
	});

	it("captures output emitted after exit while a detached child holds stdout open", async () => {
		// The shell exits immediately, but a backgrounded subshell keeps the stdout
		// pipe open and emits ticks every 50ms, the last well past the 100ms grace.
		const command = 'printf "HEAD\\n"; ( for i in 1 2 3 4 5 6; do sleep 0.05; printf "TICK$i\\n"; done ) &';
		child = spawnRegressionProcess(command, "HEAD\\n", "TICK6\\n");

		let output = "";
		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});

		const exitCode = await waitForChildProcess(child);

		expect(exitCode).toBe(0);
		expect(output).toContain("HEAD");
		expect(output).toContain("TICK6");
	});

	it("resolves promptly when a detached child holds stdout open but stays quiet", async () => {
		// The shell exits, but a backgrounded sleeper inherits the stdout pipe and
		// keeps it open for a long time without writing. `close` never fires, so we
		// must still release via the idle grace rather than hang on the open handle.
		const command = 'printf "DONE\\n"; ( sleep 30 ) &';
		child = spawnRegressionProcess(command, "DONE\\n");

		let output = "";
		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});

		const start = Date.now();
		const exitCode = await waitForChildProcess(child);
		const elapsed = Date.now() - start;

		expect(exitCode).toBe(0);
		expect(output).toContain("DONE");
		// Must not wait for the 30s sleeper; the idle grace releases us in well under a second.
		expect(elapsed).toBeLessThan(2000);
	});
});
