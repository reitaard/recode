import { mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { NamedWorkerDefinition } from "./named-worker.ts";

export interface WorkerStoragePaths {
	root: string;
	sessions: string;
	projectSessions: string;
	kioku: string;
	kiokuGlobal: string;
	kiokuProject: string;
	evaluations: string;
	state: string;
}

export interface WorkerStorageState {
	paths: WorkerStoragePaths;
	health: "ready" | "unavailable";
	sessionCount: number;
	memoryDocumentCount: number;
	evaluationCount: number;
}

function workerSlug(worker: Pick<NamedWorkerDefinition, "displayName">): string {
	const slug = worker.displayName
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) throw new Error(`Worker display name cannot form a storage key: ${worker.displayName}`);
	return slug;
}

function projectKey(cwd: string): string {
	return `--${resolve(cwd)
		.replace(/^[/\\]/, "")
		.replace(/[/\\:]/g, "-")}--`;
}

export function resolveWorkerStoragePaths(
	agentDir: string,
	cwd: string,
	worker: Pick<NamedWorkerDefinition, "displayName">,
): WorkerStoragePaths {
	const slug = workerSlug(worker);
	const root = join(agentDir, "workers", slug);
	const kioku = join(root, `kioku_${slug}`);
	return {
		root,
		sessions: join(root, "sessions"),
		projectSessions: join(root, "sessions", projectKey(cwd)),
		kioku,
		kiokuGlobal: join(kioku, "global"),
		kiokuProject: join(kioku, "projects", projectKey(cwd)),
		evaluations: join(root, "evaluations"),
		state: join(root, "state.json"),
	};
}

export async function ensureWorkerStorage(
	agentDir: string,
	cwd: string,
	workers: readonly Pick<NamedWorkerDefinition, "displayName">[],
): Promise<void> {
	for (const worker of workers) {
		const paths = resolveWorkerStoragePaths(agentDir, cwd, worker);
		await Promise.all([
			mkdir(paths.projectSessions, { recursive: true }),
			mkdir(paths.kiokuGlobal, { recursive: true }),
			mkdir(paths.kiokuProject, { recursive: true }),
			mkdir(paths.evaluations, { recursive: true }),
		]);
	}
}

async function countFiles(path: string): Promise<number> {
	const entries = await readdir(path, { withFileTypes: true, recursive: true });
	return entries.filter((entry) => entry.isFile()).length;
}

export async function inspectWorkerStorage(paths: WorkerStoragePaths): Promise<WorkerStorageState> {
	try {
		const [sessionCount, memoryDocumentCount, evaluationCount] = await Promise.all([
			countFiles(paths.sessions),
			countFiles(paths.kioku),
			countFiles(paths.evaluations),
		]);
		return { paths, health: "ready", sessionCount, memoryDocumentCount, evaluationCount };
	} catch {
		return {
			paths,
			health: "unavailable",
			sessionCount: 0,
			memoryDocumentCount: 0,
			evaluationCount: 0,
		};
	}
}
