import { createHash } from "node:crypto";
import type { RecodeMemoryChunk, RecodeMemoryScope } from "./recode-memory-types.ts";

const TARGET_CHARACTERS = 1600;
const OVERLAP_CHARACTERS = 320;

function estimateTokens(text: string): number {
	return Math.max(1, Math.ceil(text.length / 4));
}

function chunkId(documentId: string, lineStart: number, text: string): string {
	return createHash("sha256").update(`${documentId}:${lineStart}:${text}`).digest("hex").slice(0, 24);
}

export function recodeMemoryDocumentId(scope: RecodeMemoryScope, path: string): string {
	return createHash("sha256").update(`${scope}:${path}`).digest("hex").slice(0, 24);
}

export function chunkRecodeMemory(
	documentId: string,
	scope: RecodeMemoryScope,
	path: string,
	content: string,
): RecodeMemoryChunk[] {
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	const entryStarts = lines.flatMap((line, index) => (/^\s*-\s+/.test(line) ? [index] : []));
	const prefixIsOnlyMetadata = lines
		.slice(0, entryStarts[0] ?? lines.length)
		.every((line) => !line.trim() || /^\s*#/.test(line));
	if (entryStarts.length > 0 && prefixIsOnlyMetadata) {
		return entryStarts.flatMap((start, index) => {
			const end = entryStarts[index + 1] ?? lines.length;
			const rawText = lines.slice(start, end).join("\n").trim();
			if (!rawText) return [];
			return [
				{
					id: chunkId(documentId, start + 1, rawText),
					documentId,
					scope,
					path,
					lineStart: start + 1,
					lineEnd: end,
					text: rawText,
					tokenCount: estimateTokens(rawText),
				},
			];
		});
	}

	const chunks: RecodeMemoryChunk[] = [];
	let start = 0;
	while (start < lines.length) {
		let end = start;
		let size = 0;
		while (end < lines.length && (size < TARGET_CHARACTERS || end === start)) {
			size += lines[end].length + 1;
			end += 1;
		}
		const rawText = lines.slice(start, end).join("\n").trim();
		if (rawText) {
			chunks.push({
				id: chunkId(documentId, start + 1, rawText),
				documentId,
				scope,
				path,
				lineStart: start + 1,
				lineEnd: end,
				text: rawText,
				tokenCount: estimateTokens(rawText),
			});
		}
		if (end >= lines.length) break;
		let overlap = 0;
		let nextStart = end;
		while (nextStart > start + 1 && overlap < OVERLAP_CHARACTERS) {
			nextStart -= 1;
			overlap += lines[nextStart].length + 1;
		}
		start = nextStart;
	}
	return chunks;
}
