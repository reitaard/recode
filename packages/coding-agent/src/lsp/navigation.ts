/** LSP navigation result parsing and compact model-facing formatting. */

import * as path from "node:path";
import type {
	LspCallHierarchyIncomingCall,
	LspCallHierarchyItem,
	LspCallHierarchyOutgoingCall,
	LspDiagnostic,
	LspLocation,
	LspSymbolInformation,
	LspWorkspaceDiagnosticReport,
} from "./types.ts";
import { uriToFile } from "./utils.ts";

const WORKSPACE_SYMBOL_LIMIT = 100;

export interface LspNavigationLocation {
	file: string;
	line: number;
	character: number;
	context?: string;
}

export function isLspRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is { line: number; character: number } {
	return isLspRecord(value) && typeof value.line === "number" && typeof value.character === "number";
}

function isRange(value: unknown): value is LspLocation["range"] {
	return isLspRecord(value) && isPosition(value.start) && isPosition(value.end);
}

function isDiagnostic(value: unknown): value is LspDiagnostic {
	return isLspRecord(value) && isRange(value.range) && typeof value.message === "string";
}

function asLocation(value: unknown): LspLocation | null {
	if (!isLspRecord(value)) return null;
	if (typeof value.uri === "string" && isRange(value.range)) return { uri: value.uri, range: value.range };
	if (typeof value.targetUri === "string" && isRange(value.targetSelectionRange)) {
		return { uri: value.targetUri, range: value.targetSelectionRange };
	}
	return null;
}

export function normalizeLocations(value: unknown): LspLocation[] {
	const entries = Array.isArray(value) ? value : value ? [value] : [];
	return entries.map(asLocation).filter((location): location is LspLocation => location !== null);
}

function displayLocation(uri: string, line: number, character: number, cwd: string): string {
	const filePath = uriToFile(uri);
	const file = path.relative(cwd, filePath) || path.basename(filePath);
	return `${file}:${line + 1}:${character + 1}`;
}

export function parseNavigationLocations(value: unknown, cwd: string): LspNavigationLocation[] {
	return normalizeLocations(value).map((location) => ({
		file: path.relative(cwd, uriToFile(location.uri)) || path.basename(uriToFile(location.uri)),
		line: location.range.start.line + 1,
		character: location.range.start.character + 1,
	}));
}

export function formatNavigationLocations(
	locations: LspNavigationLocation[],
	action: "definition" | "type_definition" | "implementation" | "references",
	symbol?: string,
): string {
	const label = action.replace("_", " ");
	const pluralLabel = action === "references" ? "references" : `${label}${locations.length === 1 ? "" : "s"}`;
	const target = symbol ? ` for "${symbol.replace(/#\d+$/, "")}"` : "";
	if (locations.length === 0) return `0 ${pluralLabel} found${target}`;
	const fileCount = new Set(locations.map((location) => location.file)).size;
	return `${locations.length} ${pluralLabel} found${target} in ${fileCount} file${fileCount === 1 ? "" : "s"}:\n${locations
		.map(
			(location) =>
				`${location.file}:${location.line}:${location.character}${location.context ? `\n  ${location.context}` : ""}`,
		)
		.join("\n")}`;
}

function asWorkspaceSymbol(value: unknown): LspSymbolInformation | null {
	if (!isLspRecord(value) || typeof value.name !== "string" || !isLspRecord(value.location)) return null;
	if (typeof value.location.uri !== "string") return null;
	const location = isRange(value.location.range)
		? { uri: value.location.uri, range: value.location.range }
		: { uri: value.location.uri };
	return {
		name: value.name,
		location,
		...(typeof value.kind === "number" ? { kind: value.kind } : {}),
		...(typeof value.containerName === "string" ? { containerName: value.containerName } : {}),
	};
}

export function parseWorkspaceSymbols(value: unknown): LspSymbolInformation[] {
	if (!Array.isArray(value)) return [];
	return value.map(asWorkspaceSymbol).filter((symbol): symbol is LspSymbolInformation => symbol !== null);
}

export function formatWorkspaceSymbols(symbols: LspSymbolInformation[], cwd: string, query: string): string {
	const deduped = new Map<string, LspSymbolInformation>();
	for (const symbol of symbols) {
		const line = "range" in symbol.location ? symbol.location.range.start.line : -1;
		const character = "range" in symbol.location ? symbol.location.range.start.character : -1;
		const key = `${symbol.name}:${symbol.location.uri}:${line}:${character}`;
		deduped.set(key, symbol);
	}
	const results = [...deduped.values()];
	if (results.length === 0) return `No workspace symbols matching "${query}"`;
	const visible = results.slice(0, WORKSPACE_SYMBOL_LIMIT).map((symbol) => {
		const container = symbol.containerName ? ` (${symbol.containerName})` : "";
		if (!("range" in symbol.location))
			return `${symbol.name}${container} — ${path.relative(cwd, uriToFile(symbol.location.uri))}`;
		return `${symbol.name}${container} — ${displayLocation(
			symbol.location.uri,
			symbol.location.range.start.line,
			symbol.location.range.start.character,
			cwd,
		)}`;
	});
	const elided = results.length - visible.length;
	return `${results.length} workspace symbol${results.length === 1 ? "" : "s"} matching "${query}":\n${visible.join("\n")}${elided > 0 ? `\n... ${elided} more` : ""}`;
}

function asCallHierarchyItem(value: unknown): LspCallHierarchyItem | null {
	if (
		!isLspRecord(value) ||
		typeof value.name !== "string" ||
		typeof value.uri !== "string" ||
		!isRange(value.range) ||
		!isRange(value.selectionRange)
	) {
		return null;
	}
	return {
		name: value.name,
		uri: value.uri,
		range: value.range,
		selectionRange: value.selectionRange,
		...(typeof value.kind === "number" ? { kind: value.kind } : {}),
		...(Array.isArray(value.tags)
			? { tags: value.tags.filter((tag): tag is number => typeof tag === "number") }
			: {}),
		...(typeof value.detail === "string" ? { detail: value.detail } : {}),
		...(value.data === undefined ? {} : { data: value.data }),
	};
}

export function parseCallHierarchyItems(value: unknown): LspCallHierarchyItem[] {
	if (!Array.isArray(value)) return [];
	return value.map(asCallHierarchyItem).filter((item): item is LspCallHierarchyItem => item !== null);
}

export function selectCallHierarchyItem(items: LspCallHierarchyItem[], query?: string): LspCallHierarchyItem | null {
	if (!query) return items[0] ?? null;
	const normalized = query.toLowerCase();
	return items.find((item) => item.name.toLowerCase().includes(normalized)) ?? null;
}

function formatCallItem(item: LspCallHierarchyItem, cwd: string): string {
	const detail = item.detail ? ` — ${item.detail}` : "";
	return `${item.name}${detail} @ ${displayLocation(
		item.uri,
		item.selectionRange.start.line,
		item.selectionRange.start.character,
		cwd,
	)}`;
}

export function formatCallHierarchyItems(items: LspCallHierarchyItem[], cwd: string): string {
	if (items.length === 0) return "No call hierarchy item found";
	return items.map((item) => formatCallItem(item, cwd)).join("\n");
}

export function parseIncomingCalls(value: unknown): LspCallHierarchyIncomingCall[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (!isLspRecord(entry)) return [];
		const from = asCallHierarchyItem(entry.from);
		if (!from) return [];
		return [{ from, fromRanges: Array.isArray(entry.fromRanges) ? entry.fromRanges.filter(isRange) : [] }];
	});
}

export function parseOutgoingCalls(value: unknown): LspCallHierarchyOutgoingCall[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (!isLspRecord(entry)) return [];
		const to = asCallHierarchyItem(entry.to);
		if (!to) return [];
		return [{ to, fromRanges: Array.isArray(entry.fromRanges) ? entry.fromRanges.filter(isRange) : [] }];
	});
}

export function formatIncomingCalls(calls: LspCallHierarchyIncomingCall[], cwd: string): string {
	if (calls.length === 0) return "No incoming calls found";
	return calls.map((call) => `← ${formatCallItem(call.from, cwd)}`).join("\n");
}

export function formatOutgoingCalls(calls: LspCallHierarchyOutgoingCall[], cwd: string): string {
	if (calls.length === 0) return "No outgoing calls found";
	return calls.map((call) => `→ ${formatCallItem(call.to, cwd)}`).join("\n");
}

export function parseWorkspaceDiagnosticReport(value: unknown): LspWorkspaceDiagnosticReport | null {
	if (!isLspRecord(value) || !Array.isArray(value.items)) return null;
	const items: LspWorkspaceDiagnosticReport["items"] = [];
	for (const item of value.items) {
		if (!isLspRecord(item) || typeof item.uri !== "string" || (item.kind !== "full" && item.kind !== "unchanged")) {
			continue;
		}
		items.push({
			uri: item.uri,
			kind: item.kind,
			...(Array.isArray(item.items) ? { items: item.items.filter(isDiagnostic) } : {}),
			...(typeof item.version === "number" || item.version === null ? { version: item.version } : {}),
			...(typeof item.resultId === "string" ? { resultId: item.resultId } : {}),
		});
	}
	return { items };
}
