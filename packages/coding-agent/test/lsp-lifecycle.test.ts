import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getOrCreateClient } from "../src/lsp/client.ts";
import type { LspConfig } from "../src/lsp/config.ts";
import { getLspLifecycleStatuses, shutdownAllLspLifecycles, startLspLifecycle } from "../src/lsp/lifecycle.ts";

function createManagedServer(root: string): string {
	const serverPath = join(root, "managed-lsp.mjs");
	writeFileSync(
		serverPath,
		String.raw`
import fs from "node:fs";
const mode = process.argv[2] ?? "stable";
const countPath = process.argv[3];
const count = countPath && fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, "utf8")) + 1 : 1;
if (countPath) fs.writeFileSync(countPath, String(count));
let pending = Buffer.alloc(0);
function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write("Content-Length: " + Buffer.byteLength(body) + "\r\n\r\n" + body);
}
process.stdin.on("data", chunk => {
  pending = Buffer.concat([pending, chunk]);
  while (true) {
    const headerEnd = pending.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const match = /Content-Length:\s*(\d+)/i.exec(pending.subarray(0, headerEnd).toString());
    if (!match) { pending = pending.subarray(headerEnd + 4); continue; }
    const start = headerEnd + 4;
    const end = start + Number(match[1]);
    if (pending.length < end) return;
    const message = JSON.parse(pending.subarray(start, end).toString());
    pending = pending.subarray(end);
    if (message.method === "initialize") {
      send({ jsonrpc: "2.0", id: message.id, result: { capabilities: {} } });
      if (mode === "crash-always" || (mode === "crash-once" && count === 1)) setTimeout(() => process.exit(42), 20);
    }
    if (message.method === "shutdown") send({ jsonrpc: "2.0", id: message.id, result: null });
    if (message.method === "exit") process.exit(0);
  }
});
`,
	);
	return serverPath;
}

function createSlowServer(root: string): string {
	const serverPath = join(root, "slow-lsp.mjs");
	writeFileSync(serverPath, "process.stdin.resume(); setTimeout(() => {}, 30_000);");
	return serverPath;
}

function createConfig(
	name: string,
	serverPath: string,
	root: string,
	mode = "stable",
	idleTimeoutMs?: number,
): LspConfig {
	return {
		servers: {
			[name]: {
				command: process.execPath,
				args: [serverPath, mode, join(root, `${name}-starts.txt`)],
				fileTypes: [".ts"],
				useLspmux: false,
			},
		},
		...(idleTimeoutMs === undefined ? {} : { idleTimeoutMs }),
	};
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
	const started = Date.now();
	while (!predicate()) {
		if (Date.now() - started >= timeoutMs) throw new Error("Timed out waiting for LSP lifecycle state");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

afterEach(async () => {
	await shutdownAllLspLifecycles();
});

describe("LSP lifecycle", () => {
	test("starts only the server requested by a matching file operation", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-lazy-"));
		const config = createConfig("typescript", createManagedServer(root), root);
		await startLspLifecycle({ cwd: root, config, configPollIntervalMs: 10 });
		expect(getLspLifecycleStatuses(root)).toContainEqual(
			expect.objectContaining({ name: "typescript", state: "unstarted" }),
		);
		expect(existsSync(join(root, "typescript-starts.txt"))).toBe(false);

		await getOrCreateClient(config.servers.typescript!, root);
		expect(getLspLifecycleStatuses(root)).toContainEqual(
			expect.objectContaining({ name: "typescript", state: "ready" }),
		);
	});

	test("restarts a crashed server and returns it to ready", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-restart-"));
		const config = createConfig("typescript", createManagedServer(root), root, "crash-once");
		await startLspLifecycle({ cwd: root, config, restartBaseDelayMs: 10, configPollIntervalMs: 10 });
		await getOrCreateClient(config.servers.typescript!, root);
		const countPath = join(root, "typescript-starts.txt");
		await waitUntil(
			() =>
				existsSync(countPath) &&
				Number(readFileSync(countPath, "utf8")) >= 2 &&
				getLspLifecycleStatuses(root)[0]?.state === "ready",
		);
	});

	test("stops retrying after three unstable restarts", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-bounded-restart-"));
		const config = createConfig("typescript", createManagedServer(root), root, "crash-always");
		await startLspLifecycle({
			cwd: root,
			config,
			restartBaseDelayMs: 5,
			restartStabilityMs: 1_000,
			configPollIntervalMs: 10,
		});
		await getOrCreateClient(config.servers.typescript!, root);
		await waitUntil(() => getLspLifecycleStatuses(root)[0]?.state === "error");
		expect(getLspLifecycleStatuses(root)[0]).toEqual(expect.objectContaining({ state: "error", restartAttempt: 3 }));
	});

	test("shuts down clients after the configured idle timeout", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-idle-"));
		const config = createConfig("typescript", createManagedServer(root), root, "stable", 30);
		await startLspLifecycle({ cwd: root, config, configPollIntervalMs: 10 });
		await getOrCreateClient(config.servers.typescript!, root);
		await waitUntil(() => getLspLifecycleStatuses(root)[0]?.state === "unstarted");
	});

	test("reloads servers when configuration changes", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-config-reload-"));
		const serverPath = createManagedServer(root);
		let config = createConfig("first", serverPath, root);
		await startLspLifecycle({ cwd: root, config, loadConfig: () => config, configPollIntervalMs: 10 });
		config = createConfig("second", serverPath, root);
		await waitUntil(() => getLspLifecycleStatuses(root).some((status) => status.name === "second"));
		expect(getLspLifecycleStatuses(root).some((status) => status.name === "first")).toBe(false);
		expect(getLspLifecycleStatuses(root)[0]?.state).toBe("unstarted");
		await getOrCreateClient(config.servers.second!, root);
		await waitUntil(() => getLspLifecycleStatuses(root)[0]?.state === "ready");
	});

	test("surfaces initialization timeout backoff after lazy activation", async () => {
		const root = mkdtempSync(join(tmpdir(), "repi-lsp-timeout-"));
		const config: LspConfig = {
			servers: {
				slow: {
					command: process.execPath,
					args: [createSlowServer(root)],
					fileTypes: [".ts"],
					useLspmux: false,
					warmupTimeoutMs: 20,
				},
			},
		};
		await startLspLifecycle({ cwd: root, config, restartBaseDelayMs: 1_000 });
		expect(getLspLifecycleStatuses(root)[0]?.state).toBe("unstarted");
		await expect(
			getOrCreateClient(config.servers.slow!, root, {
				initializeTimeoutMs: 20,
				bypassFailureBackoff: true,
				cacheFailure: false,
			}),
		).rejects.toThrow();
		expect(getLspLifecycleStatuses(root)[0]).toEqual(
			expect.objectContaining({ state: "backoff", restartAttempt: 1 }),
		);
	});
});
