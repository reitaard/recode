/** Generation-safe background diagnostic storage and compact grouped formatting. */

import * as path from "node:path";
import type { LspDiagnostic } from "./types.ts";

const DIAGNOSTIC_MESSAGE_LIMIT = 50;
const SEVERITY_NAMES = ["error", "warning", "info", "hint"] as const;

export type LspDiagnosticSeverityName = (typeof SEVERITY_NAMES)[number];

export interface LspDiagnosticEntry {
	filePath: string;
	diagnostic: LspDiagnostic;
	server?: string;
}

export interface LspDiagnosticFilter {
	severity?: LspDiagnosticSeverityName;
	query?: string;
}

export interface LspDiagnosticSnapshot {
	cwd: string;
	filePath: string;
	generation: number;
	state: "checking" | "ready" | "error";
	entries: LspDiagnosticEntry[];
	failures: string[];
	updatedAt: number;
}

export interface LspFormattedDiagnostics {
	summary: string;
	messages: string[];
	errored: boolean;
	count: number;
}

const snapshots = new Map<string, Map<string, LspDiagnosticSnapshot>>();

function cwdKey(cwd: string): string {
	return path.resolve(cwd);
}

function fileKey(filePath: string): string {
	return path.resolve(filePath);
}

function getWorkspaceSnapshots(cwd: string): Map<string, LspDiagnosticSnapshot> {
	const key = cwdKey(cwd);
	let workspace = snapshots.get(key);
	if (!workspace) {
		workspace = new Map();
		snapshots.set(key, workspace);
	}
	return workspace;
}

function cloneSnapshot(snapshot: LspDiagnosticSnapshot): LspDiagnosticSnapshot {
	return {
		...snapshot,
		entries: snapshot.entries.map((entry) => ({ ...entry, diagnostic: { ...entry.diagnostic } })),
		failures: [...snapshot.failures],
	};
}

export function beginLspDiagnostics(cwd: string, filePath: string): number {
	const workspace = getWorkspaceSnapshots(cwd);
	const key = fileKey(filePath);
	const generation = (workspace.get(key)?.generation ?? 0) + 1;
	workspace.set(key, {
		cwd: cwdKey(cwd),
		filePath: key,
		generation,
		state: "checking",
		entries: [],
		failures: [],
		updatedAt: Date.now(),
	});
	return generation;
}

export function completeLspDiagnostics(
	cwd: string,
	filePath: string,
	generation: number,
	entries: LspDiagnosticEntry[],
	failures: string[],
): boolean {
	const workspace = getWorkspaceSnapshots(cwd);
	const key = fileKey(filePath);
	const current = workspace.get(key);
	if (!current || current.generation !== generation) return false;
	workspace.set(key, {
		...current,
		state: failures.length > 0 && entries.length === 0 ? "error" : "ready",
		entries: entries.map((entry) => ({ ...entry, filePath: fileKey(entry.filePath) })),
		failures: [...failures],
		updatedAt: Date.now(),
	});
	return true;
}

export function getLspDiagnosticSnapshot(cwd: string, filePath: string): LspDiagnosticSnapshot | undefined {
	const snapshot = snapshots.get(cwdKey(cwd))?.get(fileKey(filePath));
	return snapshot ? cloneSnapshot(snapshot) : undefined;
}

export function getLspDiagnosticSnapshots(cwd: string): LspDiagnosticSnapshot[] {
	return [...(snapshots.get(cwdKey(cwd))?.values() ?? [])].map(cloneSnapshot);
}

export async function waitForLspDiagnosticSnapshot(
	cwd: string,
	filePath: string,
	options: { timeoutMs: number; signal?: AbortSignal },
): Promise<LspDiagnosticSnapshot | undefined> {
	const started = Date.now();
	while (Date.now() - started < options.timeoutMs) {
		if (options.signal?.aborted) {
			throw options.signal.reason instanceof Error ? options.signal.reason : new Error("Operation aborted");
		}
		const snapshot = getLspDiagnosticSnapshot(cwd, filePath);
		if (!snapshot || snapshot.state !== "checking") return snapshot;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return getLspDiagnosticSnapshot(cwd, filePath);
}

export function clearLspDiagnosticSnapshotsForCwd(cwd: string): void {
	snapshots.delete(cwdKey(cwd));
}

export function clearAllLspDiagnosticSnapshots(): void {
	snapshots.clear();
}

export function severityName(diagnostic: LspDiagnostic): LspDiagnosticSeverityName {
	return SEVERITY_NAMES[Math.max(0, Math.min(SEVERITY_NAMES.length - 1, (diagnostic.severity ?? 1) - 1))];
}

function diagnosticIdentity(entry: LspDiagnosticEntry): string {
	const { diagnostic } = entry;
	return `${fileKey(entry.filePath)}:${diagnostic.range.start.line}:${diagnostic.range.start.character}:${diagnostic.range.end.line}:${diagnostic.range.end.character}:${diagnostic.message}`;
}

export function filterLspDiagnostics(
	entries: LspDiagnosticEntry[],
	filter: LspDiagnosticFilter = {},
): LspDiagnosticEntry[] {
	const query = filter.query?.trim().toLowerCase();
	const seen = new Set<string>();
	return entries.filter((entry) => {
		if (filter.severity && severityName(entry.diagnostic) !== filter.severity) return false;
		if (query) {
			const searchable = [
				entry.filePath,
				entry.server,
				entry.diagnostic.source,
				entry.diagnostic.code,
				entry.diagnostic.message,
			]
				.filter((value) => value !== undefined)
				.join(" ")
				.toLowerCase();
			if (!searchable.includes(query)) return false;
		}
		const identity = diagnosticIdentity(entry);
		if (seen.has(identity)) return false;
		seen.add(identity);
		return true;
	});
}

function plural(count: number, label: string): string {
	return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function summarize(entries: LspDiagnosticEntry[]): string {
	if (entries.length === 0) return "LSP: no issues";
	const counts = new Map<LspDiagnosticSeverityName, number>();
	for (const entry of entries) {
		const severity = severityName(entry.diagnostic);
		counts.set(severity, (counts.get(severity) ?? 0) + 1);
	}
	const parts = SEVERITY_NAMES.flatMap((severity) => {
		const count = counts.get(severity) ?? 0;
		return count > 0 ? [plural(count, severity)] : [];
	});
	return `LSP: ${parts.join(", ")}`;
}

export function formatGroupedLspDiagnostics(
	entries: LspDiagnosticEntry[],
	cwd: string,
	filter: LspDiagnosticFilter = {},
	limit = DIAGNOSTIC_MESSAGE_LIMIT,
): LspFormattedDiagnostics {
	const filtered = filterLspDiagnostics(entries, filter).sort(
		(left, right) =>
			left.filePath.localeCompare(right.filePath) ||
			(left.diagnostic.severity ?? 1) - (right.diagnostic.severity ?? 1) ||
			left.diagnostic.range.start.line - right.diagnostic.range.start.line ||
			left.diagnostic.range.start.character - right.diagnostic.range.start.character,
	);
	const visible = filtered.slice(0, Math.max(0, limit));
	const byFile = new Map<string, Map<LspDiagnosticSeverityName, LspDiagnosticEntry[]>>();
	for (const entry of visible) {
		const filePath = fileKey(entry.filePath);
		let bySeverity = byFile.get(filePath);
		if (!bySeverity) {
			bySeverity = new Map();
			byFile.set(filePath, bySeverity);
		}
		const severity = severityName(entry.diagnostic);
		bySeverity.set(severity, [...(bySeverity.get(severity) ?? []), entry]);
	}
	const messages: string[] = [];
	for (const [filePath, bySeverity] of byFile) {
		messages.push(path.relative(cwd, filePath) || path.basename(filePath));
		for (const severity of SEVERITY_NAMES) {
			const severityEntries = bySeverity.get(severity) ?? [];
			if (severityEntries.length === 0) continue;
			messages.push(`  ${plural(severityEntries.length, severity)}`);
			for (const entry of severityEntries) {
				const { diagnostic } = entry;
				const source = diagnostic.source ? `[${diagnostic.source}] ` : "";
				const code = diagnostic.code === undefined ? "" : ` (${diagnostic.code})`;
				messages.push(
					`    ${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1} ${source}${diagnostic.message}${code}`,
				);
			}
		}
	}
	if (filtered.length > visible.length) messages.push(`... ${filtered.length - visible.length} more diagnostics`);
	return {
		summary: summarize(filtered),
		messages,
		errored: filtered.some((entry) => severityName(entry.diagnostic) === "error"),
		count: filtered.length,
	};
}
