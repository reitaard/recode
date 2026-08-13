/** Optional project-only guardrails for Recode's otherwise unrestricted LSP mode. */

import { realpathSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import * as path from "node:path";
import type { LspWorkspaceEdit } from "./types.ts";
import { uriToFile } from "./utils.ts";

function isWithin(root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function isLspPathInProject(filePath: string, cwd: string): boolean {
	const root = path.resolve(cwd);
	const candidate = path.resolve(filePath);
	if (!isWithin(root, candidate)) return false;
	try {
		return isWithin(realpathSync.native(root), realpathSync.native(candidate));
	} catch {
		return true;
	}
}

export function isLspUriInProject(uri: string, cwd: string): boolean {
	try {
		return isLspPathInProject(uriToFile(uri), cwd);
	} catch {
		return false;
	}
}

async function nearestExistingPath(filePath: string): Promise<string> {
	let candidate = path.resolve(filePath);
	while (true) {
		try {
			await stat(candidate);
			return candidate;
		} catch {
			const parent = path.dirname(candidate);
			if (parent === candidate) return candidate;
			candidate = parent;
		}
	}
}

export async function assertLspPathInProject(filePath: string, cwd: string): Promise<void> {
	const root = path.resolve(cwd);
	const candidate = path.resolve(filePath);
	if (!isWithin(root, candidate)) {
		throw new Error(`LSP project-only mode blocked path outside the project: ${filePath}`);
	}
	const [realRoot, existingAncestor] = await Promise.all([realpath(root), nearestExistingPath(candidate)]);
	const realAncestor = await realpath(existingAncestor);
	if (!isWithin(realRoot, realAncestor)) {
		throw new Error(`LSP project-only mode blocked path through a symlink outside the project: ${filePath}`);
	}
}

export async function validateLspWorkspaceEditProjectBoundary(edit: LspWorkspaceEdit, cwd: string): Promise<void> {
	const paths = new Set<string>();
	for (const uri of Object.keys(edit.changes ?? {})) paths.add(uriToFile(uri));
	for (const change of edit.documentChanges ?? []) {
		if ("textDocument" in change) paths.add(uriToFile(change.textDocument.uri));
		else if (change.kind === "rename") {
			paths.add(uriToFile(change.oldUri));
			paths.add(uriToFile(change.newUri));
		} else paths.add(uriToFile(change.uri));
	}
	await Promise.all([...paths].map((filePath) => assertLspPathInProject(filePath, cwd)));
}
