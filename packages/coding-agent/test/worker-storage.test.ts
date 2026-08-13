import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	ensureWorkerStorage,
	inspectWorkerStorage,
	resolveWorkerStoragePaths,
} from "../src/core/delegation/worker-storage.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("worker storage", () => {
	it("creates isolated direct-chat, Kioku, evaluation, and state paths by worker name", async () => {
		const root = await mkdtemp(join(tmpdir(), "repi-worker-storage-"));
		roots.push(root);
		const worker = { displayName: "Mayuri" };
		const paths = resolveWorkerStoragePaths(root, "C:\\work\\project", worker);

		expect(paths.root).toBe(join(root, "workers", "mayuri"));
		expect(paths.kioku).toBe(join(paths.root, "kioku_mayuri"));
		expect(paths.projectSessions).toContain(join("sessions", "--C--work-project--"));
		expect(paths.kiokuProject).toContain(join("projects", "--C--work-project--"));

		await ensureWorkerStorage(root, "C:\\work\\project", [worker]);
		await expect(inspectWorkerStorage(paths)).resolves.toMatchObject({
			health: "ready",
			sessionCount: 0,
			memoryDocumentCount: 0,
			evaluationCount: 0,
		});
	});

	it("keeps workers in separate roots", () => {
		const mayuri = resolveWorkerStoragePaths("agent", ".", { displayName: "Mayuri" });
		const levi = resolveWorkerStoragePaths("agent", ".", { displayName: "Levi" });
		expect(mayuri.root).not.toBe(levi.root);
		expect(mayuri.kioku).toContain("kioku_mayuri");
		expect(levi.kioku).toContain("kioku_levi");
	});
});
