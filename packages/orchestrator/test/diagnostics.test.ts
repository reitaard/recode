import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { createMaestroDiagnosticBundle } from "../src/diagnostics.ts";
import { saveInstances } from "../src/storage.ts";

const originalDirectory = process.env.PI_ORCHESTRATOR_DIR;
let directory: string | undefined;

afterEach(() => {
	if (originalDirectory === undefined) delete process.env.PI_ORCHESTRATOR_DIR;
	else process.env.PI_ORCHESTRATOR_DIR = originalDirectory;
	if (directory) rmSync(directory, { recursive: true, force: true });
	directory = undefined;
});

describe("Maestro diagnostics", () => {
	test("bounds child records and omits raw workspace, session, and process identity", () => {
		directory = mkdtempSync(join(tmpdir(), "recode-maestro-diagnostics-"));
		process.env.PI_ORCHESTRATOR_DIR = directory;
		saveInstances(
			Array.from({ length: 65 }, (_, index) => ({
				id: `instance-${index}`,
				status: "online" as const,
				cwd: `/private/workspace/${index}`,
				createdAt: "2026-07-30T00:00:00.000Z",
				sessionId: `session-${index}`,
				processIdentity: { pid: index + 1, startReceipt: "a".repeat(64) },
				workspaceReceipt: {
					schemaVersion: 1 as const,
					ownerInstanceId: `instance-${index}`,
					access: "read-only" as const,
					selectedPath: `/private/workspace/${index}`,
					worktreeRoot: `/private/workspace/${index}`,
					worktreeIdentity: "b".repeat(64),
					branch: "x".repeat(256),
					selectedAt: "2026-07-30T00:00:00.000Z",
					managed: false as const,
				},
			})),
		);
		const bundle = createMaestroDiagnosticBundle({ version: "0.81.5" });
		const instances = bundle.instances as Array<Record<string, unknown>>;
		assert.equal(instances.length, 64);
		assert.equal((instances[0].branch as string).length, 128);
		const serialized = JSON.stringify(bundle);
		assert.doesNotMatch(serialized, /private\/workspace|session-64|startReceipt/);
	});
});
