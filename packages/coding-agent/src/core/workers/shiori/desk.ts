import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import type { RecodeMemoryManager } from "../../recode-memory/recode-memory-manager.ts";

const MAX_INTAKE_BYTES = 512 * 1024;

export interface RecodeShioriDeskItem {
	sourcePath: string;
	deskPath: string;
	content: string;
}

function safeFilename(path: string): string {
	const extension = extname(path) || ".txt";
	const stem = basename(path, extname(path))
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return `${new Date().toISOString().replace(/[:.]/g, "-")}-${stem || "memory"}${extension}`;
}

export async function placeOnRecodeShioriDesk(
	manager: RecodeMemoryManager,
	requestedPath: string,
	cwd: string,
): Promise<RecodeShioriDeskItem> {
	const sourcePath = resolve(cwd, requestedPath);
	const info = await stat(sourcePath);
	if (!info.isFile()) throw new Error("Shiori's Desk accepts files only");
	if (info.size > MAX_INTAKE_BYTES) throw new Error("Files placed on Shiori's Desk must be 512 KB or smaller");
	const deskDirectory = join(manager.projectRoot, "desk");
	await mkdir(deskDirectory, { recursive: true });
	const deskPath = join(deskDirectory, safeFilename(sourcePath));
	await copyFile(sourcePath, deskPath);
	return { sourcePath, deskPath, content: await readFile(deskPath, "utf8") };
}

export async function archiveRecodeShioriDeskItem(item: RecodeShioriDeskItem): Promise<string> {
	const archiveDirectory = join(dirname(dirname(item.deskPath)), "archive");
	await mkdir(archiveDirectory, { recursive: true });
	const archivePath = join(archiveDirectory, basename(item.deskPath));
	await rename(item.deskPath, archivePath);
	return archivePath;
}

export async function discardRecodeShioriDeskItem(item: RecodeShioriDeskItem): Promise<void> {
	await rm(item.deskPath, { force: true });
}
