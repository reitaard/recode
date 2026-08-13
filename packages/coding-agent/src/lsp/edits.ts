/** LSP text/workspace edit application adapted from can1357/oh-my-pi (MIT). */

import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { validateLspWorkspaceEditProjectBoundary } from "./recode-lsp-boundary.ts";
import type {
	LspCreateFile,
	LspDeleteFile,
	LspDocumentChange,
	LspPosition,
	LspRange,
	LspRenameFile,
	LspTextDocumentEdit,
	LspTextEdit,
	LspWorkspaceEdit,
} from "./types.ts";
import { uriToFile } from "./utils.ts";

function comparePosition(left: LspPosition, right: LspPosition): number {
	return left.line === right.line ? left.character - right.character : left.line - right.line;
}

function positionsEqual(left: LspPosition, right: LspPosition): boolean {
	return left.line === right.line && left.character === right.character;
}

function rangesEqual(left: LspRange, right: LspRange): boolean {
	return positionsEqual(left.start, right.start) && positionsEqual(left.end, right.end);
}

function formatRange(range: LspRange): string {
	return `${range.start.line + 1}:${range.start.character + 1}-${range.end.line + 1}:${range.end.character + 1}`;
}

export function rangesOverlap(left: LspRange, right: LspRange): boolean {
	return comparePosition(left.start, right.end) < 0 && comparePosition(right.start, left.end) < 0;
}

export function sortAndValidateTextEdits(edits: LspTextEdit[]): LspTextEdit[] {
	const sorted = edits
		.map((edit, index) => ({ edit, index }))
		.sort((left, right) => {
			const lineDifference = right.edit.range.start.line - left.edit.range.start.line;
			if (lineDifference !== 0) return lineDifference;
			const characterDifference = right.edit.range.start.character - left.edit.range.start.character;
			return characterDifference !== 0 ? characterDifference : right.index - left.index;
		})
		.map(({ edit }) => edit);
	const unique: LspTextEdit[] = [];
	for (const edit of sorted) {
		const previous = unique.at(-1);
		const nonEmpty = !positionsEqual(edit.range.start, edit.range.end);
		if (previous && nonEmpty && rangesEqual(previous.range, edit.range) && previous.newText === edit.newText)
			continue;
		unique.push(edit);
	}
	for (let index = 0; index < unique.length - 1; index++) {
		const later = unique[index].range;
		const earlier = unique[index + 1].range;
		if (comparePosition(earlier.end, later.start) > 0) {
			throw new Error(`Overlapping LSP edits: ${formatRange(earlier)} conflicts with ${formatRange(later)}`);
		}
	}
	return unique;
}

export function applyTextEditsToString(content: string, edits: LspTextEdit[]): string {
	const lines = content.split("\n");
	for (const edit of sortAndValidateTextEdits(edits)) {
		const { start, end } = edit.range;
		if (start.line < 0 || end.line < start.line || end.line >= lines.length) {
			throw new Error(`LSP edit range is outside the document: ${formatRange(edit.range)}`);
		}
		const startLine = lines[start.line] ?? "";
		const endLine = lines[end.line] ?? "";
		if (start.character > startLine.length || end.character > endLine.length) {
			throw new Error(`LSP edit character is outside the document: ${formatRange(edit.range)}`);
		}
		const replacement = startLine.slice(0, start.character) + edit.newText + endLine.slice(end.character);
		lines.splice(start.line, end.line - start.line + 1, ...replacement.split("\n"));
	}
	return lines.join("\n");
}

export function flattenWorkspaceTextEdits(edit: LspWorkspaceEdit): Map<string, LspTextEdit[]> {
	const flattened = new Map<string, LspTextEdit[]>();
	const append = (uri: string, edits: LspTextEdit[]): void => {
		if (edits.length === 0) return;
		flattened.set(uri, [...(flattened.get(uri) ?? []), ...edits]);
	};
	for (const [uri, edits] of Object.entries(edit.changes ?? {})) append(uri, edits);
	for (const change of edit.documentChanges ?? []) {
		if ("textDocument" in change) append(change.textDocument.uri, change.edits);
	}
	return flattened;
}

export async function applyTextEdits(filePath: string, edits: LspTextEdit[]): Promise<void> {
	const content = await readFile(filePath, "utf-8");
	await writeFile(filePath, applyTextEditsToString(content, edits), "utf-8");
}

function displayPath(filePath: string, cwd: string): string {
	const relative = path.relative(cwd, filePath);
	return relative && !relative.startsWith("..") ? relative : filePath;
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

async function applyResourceChange(
	change: LspCreateFile | LspRenameFile | LspDeleteFile,
	cwd: string,
): Promise<string> {
	if (change.kind === "create") {
		const filePath = uriToFile(change.uri);
		if (await exists(filePath)) {
			if (change.options?.ignoreIfExists) return `Skipped existing ${displayPath(filePath, cwd)}`;
			if (!change.options?.overwrite) throw new Error(`Cannot create existing file: ${displayPath(filePath, cwd)}`);
		}
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, "", "utf-8");
		return `Created ${displayPath(filePath, cwd)}`;
	}
	if (change.kind === "rename") {
		const oldPath = uriToFile(change.oldUri);
		const newPath = uriToFile(change.newUri);
		if (await exists(newPath)) {
			if (change.options?.ignoreIfExists) return `Skipped existing ${displayPath(newPath, cwd)}`;
			if (!change.options?.overwrite)
				throw new Error(`Cannot overwrite existing file: ${displayPath(newPath, cwd)}`);
			await rm(newPath, { recursive: true, force: true });
		}
		await mkdir(path.dirname(newPath), { recursive: true });
		await rename(oldPath, newPath);
		return `Renamed ${displayPath(oldPath, cwd)} -> ${displayPath(newPath, cwd)}`;
	}
	const filePath = uriToFile(change.uri);
	if (!(await exists(filePath)) && change.options?.ignoreIfNotExists) {
		return `Skipped missing ${displayPath(filePath, cwd)}`;
	}
	await rm(filePath, { recursive: change.options?.recursive ?? false });
	return `Deleted ${displayPath(filePath, cwd)}`;
}

function validateDocumentChanges(changes: LspDocumentChange[]): void {
	for (const change of changes) {
		if ("textDocument" in change) sortAndValidateTextEdits(change.edits);
	}
}

export async function applyWorkspaceEdit(
	edit: LspWorkspaceEdit,
	cwd: string,
	options: { projectOnly?: boolean } = {},
): Promise<string[]> {
	if (options.projectOnly) await validateLspWorkspaceEditProjectBoundary(edit, cwd);
	const applied: string[] = [];
	if (edit.documentChanges) {
		validateDocumentChanges(edit.documentChanges);
		for (const change of edit.documentChanges) {
			if ("textDocument" in change) {
				const filePath = uriToFile((change as LspTextDocumentEdit).textDocument.uri);
				await applyTextEdits(filePath, change.edits);
				applied.push(`Applied ${change.edits.length} edit(s) to ${displayPath(filePath, cwd)}`);
			} else {
				applied.push(await applyResourceChange(change, cwd));
			}
		}
		return applied;
	}
	const changes = Object.entries(edit.changes ?? {});
	for (const [, edits] of changes) sortAndValidateTextEdits(edits);
	for (const [uri, edits] of changes) {
		if (edits.length === 0) continue;
		const filePath = uriToFile(uri);
		await applyTextEdits(filePath, edits);
		applied.push(`Applied ${edits.length} edit(s) to ${displayPath(filePath, cwd)}`);
	}
	return applied;
}
