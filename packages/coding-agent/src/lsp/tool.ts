/** Recode LSP query tool, adapted from can1357/oh-my-pi (MIT). */

import { access, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { Text } from "@reitaard/recode-tui";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../core/extensions/types.ts";
import { generateUnifiedPatch } from "../core/tools/edit-diff.ts";
import { resolveToCwd } from "../core/tools/path-utils.ts";
import { wrapToolDefinition } from "../core/tools/tool-definition-wrapper.ts";
import { sleep } from "../utils/sleep.ts";
import {
	getActiveLspClients,
	getOrCreateClient,
	notifyFileRenamed,
	notifySaved,
	refreshFile,
	sendRequest,
	syncContent,
	waitForDiagnostics,
	waitForProjectReady,
} from "./client.ts";
import { getServersForFile, type LspControlSettings, loadLspConfig } from "./config.ts";
import {
	formatGroupedLspDiagnostics,
	getLspDiagnosticSnapshot,
	getLspDiagnosticSnapshots,
	type LspDiagnosticEntry,
	type LspDiagnosticSeverityName,
	waitForLspDiagnosticSnapshot,
} from "./diagnostics.ts";
import { applyTextEdits, applyTextEditsToString, applyWorkspaceEdit, flattenWorkspaceTextEdits } from "./edits.ts";
import { detectLspmux } from "./lspmux.ts";
import {
	formatCallHierarchyItems,
	formatIncomingCalls,
	formatNavigationLocations,
	formatOutgoingCalls,
	formatWorkspaceSymbols,
	type LspNavigationLocation,
	normalizeLocations,
	parseCallHierarchyItems,
	parseIncomingCalls,
	parseNavigationLocations,
	parseOutgoingCalls,
	parseWorkspaceDiagnosticReport,
	parseWorkspaceSymbols,
	selectCallHierarchyItem,
} from "./navigation.ts";
import { assertLspPathInProject, isLspUriInProject } from "./recode-lsp-boundary.ts";
import { formatLspCall, renderLspResult } from "./render.ts";
import type { LspClient, LspCodeAction, LspDocumentChange, LspTextEdit, LspWorkspaceEdit } from "./types.ts";
import { fileToUri, uriToFile } from "./utils.ts";

const WORKSPACE_DIAGNOSTIC_LIMIT = 200;
const NAVIGATION_CONTEXT_LIMIT = 20;
const NAVIGATION_CONTEXT_CHARACTER_LIMIT = 240;
const REFERENCE_RETRY_DELAYS_MS = [250, 750, 1500, 2500] as const;

const lspSchema = Type.Object({
	action: Type.Union(
		[
			Type.Literal("status"),
			Type.Literal("diagnostics"),
			Type.Literal("hover"),
			Type.Literal("definition"),
			Type.Literal("type_definition"),
			Type.Literal("implementation"),
			Type.Literal("references"),
			Type.Literal("symbols"),
			Type.Literal("workspace_symbols"),
			Type.Literal("call_hierarchy"),
			Type.Literal("incoming_calls"),
			Type.Literal("outgoing_calls"),
			Type.Literal("workspace_diagnostics"),
			Type.Literal("capabilities"),
			Type.Literal("format"),
			Type.Literal("rename"),
			Type.Literal("rename_file"),
			Type.Literal("code_actions"),
		],
		{ description: "Language-server operation" },
	),
	file: Type.Optional(Type.String({ description: "Project-relative file path" })),
	line: Type.Optional(Type.Number({ description: "1-based line number" })),
	character: Type.Optional(Type.Number({ description: "0-based character offset" })),
	symbol: Type.Optional(
		Type.String({ description: "Symbol substring on line; use #N to select a repeated occurrence" }),
	),
	new_name: Type.Optional(Type.String({ description: "New symbol name or rename_file destination path" })),
	query: Type.Optional(Type.String({ description: "Case-insensitive symbol, call-item, or code-action filter" })),
	severity: Type.Optional(
		Type.Union([Type.Literal("error"), Type.Literal("warning"), Type.Literal("info"), Type.Literal("hint")], {
			description: "Only return diagnostics at this severity",
		}),
	),
	wait_ms: Type.Optional(Type.Number({ minimum: 0, maximum: 12_000, description: "Wait for background diagnostics" })),
	apply: Type.Optional(Type.Boolean({ description: "Apply the returned edit; defaults to preview only" })),
});

export type LspToolInput = Static<typeof lspSchema>;

export interface LspToolDetails {
	action: LspToolInput["action"];
	servers: string[];
	request?: LspToolInput;
	locations?: LspNavigationLocation[];
}

export interface LspToolOptions {
	controls?: LspControlSettings;
	readOnly?: boolean;
}

export const LSP_READONLY_ACTIONS: ReadonlySet<LspToolInput["action"]> = new Set([
	"status",
	"diagnostics",
	"hover",
	"definition",
	"type_definition",
	"implementation",
	"references",
	"symbols",
	"workspace_symbols",
	"call_hierarchy",
	"incoming_calls",
	"outgoing_calls",
	"workspace_diagnostics",
	"capabilities",
]);

const POSITION_REQUIRED_ACTIONS: ReadonlySet<LspToolInput["action"]> = new Set([
	"hover",
	"definition",
	"type_definition",
	"implementation",
	"references",
	"call_hierarchy",
	"incoming_calls",
	"outgoing_calls",
	"rename",
	"code_actions",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextEdit(value: unknown): value is LspTextEdit {
	if (!isRecord(value) || typeof value.newText !== "string" || !isRecord(value.range)) return false;
	const { start, end } = value.range;
	return (
		isRecord(start) &&
		isRecord(end) &&
		typeof start.line === "number" &&
		typeof start.character === "number" &&
		typeof end.line === "number" &&
		typeof end.character === "number"
	);
}

function asWorkspaceEdit(value: unknown): LspWorkspaceEdit | null {
	if (!isRecord(value)) return null;
	if (value.changes !== undefined && !isRecord(value.changes)) return null;
	if (value.documentChanges !== undefined && !Array.isArray(value.documentChanges)) return null;
	return value as unknown as LspWorkspaceEdit;
}

function asCodeActions(value: unknown): LspCodeAction[] {
	if (!Array.isArray(value)) return [];
	return value.filter((action): action is LspCodeAction => isRecord(action) && typeof action.title === "string");
}

function parseSymbolSpec(symbolSpec: string): { symbol: string; occurrence: number } {
	const match = /^(.*?)(?:#([1-9]\d*))?$/.exec(symbolSpec);
	const symbol = match?.[1] ?? symbolSpec;
	if (!symbol) throw new Error("symbol must not be empty");
	return { symbol, occurrence: match?.[2] ? Number.parseInt(match[2], 10) : 1 };
}

async function resolveSymbolCharacter(filePath: string, line: number, symbolSpec: string): Promise<number> {
	const sourceLine = (await readFile(filePath, "utf-8")).split(/\r?\n/)[Math.max(1, line) - 1] ?? "";
	const { symbol, occurrence } = parseSymbolSpec(symbolSpec);
	const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const identifier = /^[\p{L}\p{N}_$]+$/u.test(symbol);
	const matcher = new RegExp(identifier ? `(?<![\\p{L}\\p{N}_$])${escaped}(?![\\p{L}\\p{N}_$])` : escaped, "gu");
	const matches = [...sourceLine.matchAll(matcher)];
	if (matches.length === 0) throw new Error(`Symbol "${symbol}" not found on line ${line}`);
	if (occurrence > matches.length) {
		throw new Error(
			`Symbol "${symbol}" occurrence ${occurrence} is out of bounds on line ${line} (found ${matches.length})`,
		);
	}
	return matches[occurrence - 1].index;
}

function describeWorkspaceEdit(edit: LspWorkspaceEdit): string {
	const textEdits = [...flattenWorkspaceTextEdits(edit).values()].reduce((total, edits) => total + edits.length, 0);
	const resourceChanges = (edit.documentChanges ?? []).filter((change) => "kind" in change).length;
	return `${textEdits} text edit${textEdits === 1 ? "" : "s"}${resourceChanges > 0 ? `, ${resourceChanges} file operation${resourceChanges === 1 ? "" : "s"}` : ""}`;
}

function changedUris(edit: LspWorkspaceEdit): string[] {
	const uris = new Set(flattenWorkspaceTextEdits(edit).keys());
	for (const change of edit.documentChanges ?? []) {
		if ("kind" in change) {
			if (change.kind === "create" || change.kind === "delete") uris.add(change.uri);
			if (change.kind === "rename") {
				uris.add(change.oldUri);
				uris.add(change.newUri);
			}
		}
	}
	return [...uris];
}

function appendFileRename(edit: LspWorkspaceEdit | null, oldUri: string, newUri: string): LspWorkspaceEdit {
	const documentChanges: LspDocumentChange[] = [];
	if (edit) {
		for (const [uri, edits] of flattenWorkspaceTextEdits(edit)) {
			documentChanges.push({ textDocument: { uri, version: null }, edits });
		}
	}
	documentChanges.push({ kind: "rename", oldUri, newUri });
	return { documentChanges };
}

async function syncAppliedWorkspaceEdit(
	edit: LspWorkspaceEdit,
	cwd: string,
	controls?: LspControlSettings,
	signal?: AbortSignal,
): Promise<void> {
	await Promise.allSettled(
		changedUris(edit).map(async (uri) => {
			if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
			const filePath = uriToFile(uri);
			let content: string;
			try {
				content = await readFile(filePath, "utf-8");
			} catch {
				return;
			}
			for (const [, client] of await getClientsForFile(cwd, filePath, true, controls)) {
				await syncContent(client, filePath, content);
				await notifySaved(client, filePath, content);
			}
		}),
	);
	if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
}

function formatHover(value: unknown): string {
	if (!isRecord(value)) return "No hover information";
	const contents = value.contents;
	if (typeof contents === "string") return contents;
	if (isRecord(contents) && typeof contents.value === "string") return contents.value;
	if (!Array.isArray(contents)) return "No hover information";
	const lines = contents.flatMap((entry) => {
		if (typeof entry === "string") return [entry];
		if (isRecord(entry) && typeof entry.value === "string") return [entry.value];
		return [];
	});
	return lines.length > 0 ? lines.join("\n\n") : "No hover information";
}

function formatSymbols(value: unknown): string {
	if (!Array.isArray(value) || value.length === 0) return "No symbols found";
	return value
		.flatMap((symbol) => {
			if (!isRecord(symbol) || typeof symbol.name !== "string") return [];
			const range = isRecord(symbol.selectionRange)
				? symbol.selectionRange
				: isRecord(symbol.location)
					? symbol.location
					: null;
			const nestedRange = range && isRecord(range.range) ? range.range : range;
			const start = nestedRange && isRecord(nestedRange.start) ? nestedRange.start : null;
			const line = start && typeof start.line === "number" ? `:${start.line + 1}` : "";
			return [`${symbol.name}${line}`];
		})
		.join("\n");
}

async function getClientsForFile(
	cwd: string,
	filePath: string,
	includeLinters: boolean,
	controls?: LspControlSettings,
): Promise<Array<[string, LspClient]>> {
	const servers = getServersForFile(loadLspConfig(cwd, undefined, controls), filePath, { includeLinters });
	return Promise.all(
		servers.map(async ([name, config]) => [name, await getOrCreateClient(config, cwd)] as [string, LspClient]),
	);
}

function isIncompleteReferenceResult(
	value: unknown,
	uri: string,
	position: { line: number; character: number },
): boolean {
	const locations = normalizeLocations(value);
	const targetPath = path.resolve(uriToFile(uri));
	const normalizedTargetPath = process.platform === "win32" ? targetPath.toLowerCase() : targetPath;
	return (
		locations.length === 0 ||
		locations.every((location) => {
			const locationPath = path.resolve(uriToFile(location.uri));
			const normalizedLocationPath = process.platform === "win32" ? locationPath.toLowerCase() : locationPath;
			return (
				normalizedLocationPath === normalizedTargetPath &&
				location.range.start.line === position.line &&
				location.range.start.character === position.character
			);
		})
	);
}

async function requestReferencesWithRetry(
	client: LspClient,
	params: {
		textDocument: { uri: string };
		position: { line: number; character: number };
		context: { includeDeclaration: true };
	},
	signal?: AbortSignal,
): Promise<unknown> {
	await waitForProjectReady(client, signal);
	let result: unknown;
	for (let attempt = 0; attempt <= REFERENCE_RETRY_DELAYS_MS.length; attempt++) {
		result = await sendRequest(client, "textDocument/references", params, signal);
		if (!isIncompleteReferenceResult(result, params.textDocument.uri, params.position)) return result;
		const retryDelay = REFERENCE_RETRY_DELAYS_MS[attempt];
		if (retryDelay !== undefined) await sleep(retryDelay, signal);
	}
	return result;
}

async function addNavigationContext(locations: LspNavigationLocation[], cwd: string): Promise<LspNavigationLocation[]> {
	const sourceFiles = new Map<string, Promise<string[] | null>>();
	const getSourceLines = (file: string): Promise<string[] | null> => {
		const filePath = path.resolve(cwd, file);
		let source = sourceFiles.get(filePath);
		if (!source) {
			source = readFile(filePath, "utf-8")
				.then((content) => content.split(/\r?\n/))
				.catch(() => null);
			sourceFiles.set(filePath, source);
		}
		return source;
	};
	return Promise.all(
		locations.map(async (location, index) => {
			if (index >= NAVIGATION_CONTEXT_LIMIT) return location;
			const lines = await getSourceLines(location.file);
			const context = lines?.[location.line - 1]?.trim();
			return context ? { ...location, context: context.slice(0, NAVIGATION_CONTEXT_CHARACTER_LIMIT) } : location;
		}),
	);
}

export function createLspToolDefinition(
	cwd: string,
	options: LspToolOptions = {},
): ToolDefinition<typeof lspSchema, LspToolDetails> {
	return {
		name: "lsp",
		label: "LSP",
		description:
			"Query project language servers for diagnostics, definitions, implementations, workspace symbols, call relationships, and code intelligence. Supports previewable formatting, symbol/file rename, and code actions; mutations require apply=true.",
		promptSnippet: "Query language-server diagnostics and code intelligence",
		promptGuidelines: [
			"Use lsp for code intelligence when a language server is available.",
			"For position-based queries, prefer file + line + symbol over manually counting character offsets.",
			"If edit or write reports that diagnostics are checking in the background, call lsp diagnostics for that file with wait_ms before claiming the change is clean.",
			"Use severity and query to retrieve only the diagnostic details relevant to the current task.",
		],
		parameters: lspSchema,
		renderShell: "self",
		async execute(_toolCallId, input, signal) {
			if (options.readOnly && !LSP_READONLY_ACTIONS.has(input.action)) {
				throw new Error(`LSP action ${input.action} is unavailable in a read-only tool set`);
			}
			const projectOnly = options.controls?.projectOnly === true;
			if (input.action === "status") {
				const config = loadLspConfig(cwd, undefined, options.controls);
				const active = getActiveLspClients();
				const lines = Object.entries(config.servers).map(([name, server]) => {
					const client = active.find(
						(candidate) => candidate.cwd === cwd && candidate.config.command === server.command,
					);
					return `${name}: ${client?.state ?? "available"}`;
				});
				if (options.controls?.lspmux === false) {
					lines.push("lspmux: disabled");
				} else {
					const lspmux = await detectLspmux();
					if (lspmux.available) lines.push(`lspmux: ${lspmux.running ? "active" : "installed, not running"}`);
				}
				return {
					content: [{ type: "text", text: lines.length > 0 ? lines.join("\n") : "No language servers available" }],
					details: { action: input.action, servers: Object.keys(config.servers) },
				};
			}

			if (input.action === "workspace_symbols") {
				const query = input.query?.trim();
				if (!query) throw new Error("workspace_symbols requires query");
				const config = loadLspConfig(cwd, undefined, options.controls);
				if (Object.keys(config.servers).length === 0) throw new Error("No language servers are available");
				const symbols = [];
				const respondingServers: string[] = [];
				const failures: string[] = [];
				for (const [name, server] of Object.entries(config.servers)) {
					try {
						const client = await getOrCreateClient(server, cwd);
						const result = await sendRequest(client, "workspace/symbol", { query }, signal, 10_000);
						symbols.push(
							...parseWorkspaceSymbols(result).filter(
								(symbol) => !projectOnly || isLspUriInProject(symbol.location.uri, cwd),
							),
						);
						respondingServers.push(name);
					} catch (error) {
						if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : error;
						failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
					}
				}
				if (respondingServers.length === 0 && failures.length > 0) {
					throw new Error(`Workspace symbol search failed:\n${failures.join("\n")}`);
				}
				return {
					content: [{ type: "text", text: formatWorkspaceSymbols(symbols, cwd, query) }],
					details: { action: input.action, servers: respondingServers },
				};
			}

			if (input.action === "workspace_diagnostics") {
				const config = loadLspConfig(cwd, undefined, options.controls);
				if (Object.keys(config.servers).length === 0) throw new Error("No language servers are available");
				const entries: LspDiagnosticEntry[] = getLspDiagnosticSnapshots(cwd).flatMap(
					(snapshot) => snapshot.entries,
				);
				const respondingServers: string[] = [];
				const failures: string[] = [];
				for (const [name, server] of Object.entries(config.servers)) {
					let client: LspClient | undefined;
					try {
						client = await getOrCreateClient(server, cwd);
						const result = await sendRequest(
							client,
							"workspace/diagnostic",
							{ previousResultIds: [] },
							signal,
							10_000,
						);
						const report = parseWorkspaceDiagnosticReport(result);
						for (const item of report?.items ?? []) {
							if (item.kind === "full") {
								entries.push(
									...(item.items ?? []).map((diagnostic) => ({
										filePath: uriToFile(item.uri),
										diagnostic,
										server: name,
									})),
								);
							}
						}
						for (const [uri, published] of client.diagnostics) {
							entries.push(
								...published.diagnostics.map((diagnostic) => ({
									filePath: uriToFile(uri),
									diagnostic,
									server: name,
								})),
							);
						}
						respondingServers.push(name);
					} catch (error) {
						if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : error;
						for (const [uri, published] of client?.diagnostics ?? []) {
							entries.push(
								...published.diagnostics.map((diagnostic) => ({
									filePath: uriToFile(uri),
									diagnostic,
									server: name,
								})),
							);
						}
						failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
					}
				}
				const visibleEntries = projectOnly
					? entries.filter((entry) => isLspUriInProject(fileToUri(entry.filePath), cwd))
					: entries;
				const formatted = formatGroupedLspDiagnostics(
					visibleEntries,
					cwd,
					{ severity: input.severity as LspDiagnosticSeverityName | undefined, query: input.query },
					WORKSPACE_DIAGNOSTIC_LIMIT,
				);
				const text = [formatted.summary, ...formatted.messages];
				if (failures.length > 0)
					text.push(`Unavailable servers:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
				return {
					content: [{ type: "text", text: text.join("\n") }],
					details: { action: input.action, servers: respondingServers },
				};
			}

			if (!input.file) throw new Error(`${input.action} requires a file`);
			if (
				POSITION_REQUIRED_ACTIONS.has(input.action) &&
				(input.line === undefined || (input.symbol === undefined && input.character === undefined))
			) {
				throw new Error(`${input.action} requires line and either symbol or character`);
			}
			const filePath = resolveToCwd(input.file, cwd);
			if (projectOnly) await assertLspPathInProject(filePath, cwd);
			const clients = await getClientsForFile(cwd, filePath, input.action === "diagnostics", options.controls);
			if (clients.length === 0) throw new Error(`No language server is available for ${input.file}`);
			for (const [, client] of clients) await refreshFile(client, filePath);
			const uri = fileToUri(filePath);

			if (input.action === "diagnostics") {
				const waitMs = Math.max(0, Math.min(12_000, input.wait_ms ?? 0));
				const snapshot =
					waitMs > 0
						? await waitForLspDiagnosticSnapshot(cwd, filePath, { timeoutMs: waitMs, signal })
						: getLspDiagnosticSnapshot(cwd, filePath);
				if (snapshot?.state === "checking") {
					return {
						content: [{ type: "text", text: "LSP diagnostics are still checking in the background" }],
						details: { action: input.action, servers: clients.map(([name]) => name) },
					};
				}
				const entries = snapshot
					? snapshot.entries
					: (await Promise.all(clients.map(([, client]) => waitForDiagnostics(client, uri, { signal }))))
							.flat()
							.map((diagnostic) => ({ filePath, diagnostic }));
				const formatted = formatGroupedLspDiagnostics(entries, cwd, {
					severity: input.severity as LspDiagnosticSeverityName | undefined,
					query: input.query,
				});
				const text = [formatted.summary, ...formatted.messages];
				if (snapshot?.failures.length) {
					text.push(...snapshot.failures.map((failure) => `LSP unavailable: ${failure}`));
				}
				return {
					content: [{ type: "text", text: text.join("\n") }],
					details: { action: input.action, servers: clients.map(([name]) => name) },
				};
			}

			const primary = clients.find(([, client]) => !client.config.isLinter) ?? clients[0];
			const [serverName, client] = primary;
			if (input.action === "capabilities") {
				return {
					content: [{ type: "text", text: JSON.stringify(client.serverCapabilities ?? {}, null, 2) }],
					details: { action: input.action, servers: [serverName] },
				};
			}

			const positionLine = Math.max(1, input.line ?? 1);
			const positionCharacter = input.symbol
				? await resolveSymbolCharacter(filePath, positionLine, input.symbol)
				: Math.max(0, input.character ?? 0);
			const params = {
				textDocument: { uri },
				position: { line: positionLine - 1, character: positionCharacter },
			};

			if (input.action === "rename_file") {
				if (!input.new_name) throw new Error("rename_file requires new_name as the destination path");
				const destinationPath = resolveToCwd(input.new_name, cwd);
				if (projectOnly) await assertLspPathInProject(destinationPath, cwd);
				if (destinationPath === filePath) throw new Error("Source and destination paths are identical");
				const sourceStat = await stat(filePath);
				if (!sourceStat.isFile()) throw new Error("rename_file currently supports files, not directories");
				try {
					await access(destinationPath);
					throw new Error(`Destination already exists: ${input.new_name}`);
				} catch (error) {
					if (error instanceof Error && error.message.startsWith("Destination already exists:")) throw error;
				}
				const newUri = fileToUri(destinationPath);
				let serverEdit: LspWorkspaceEdit | null = null;
				let serverNote = "";
				try {
					serverEdit = asWorkspaceEdit(
						await sendRequest(
							client,
							"workspace/willRenameFiles",
							{ files: [{ oldUri: uri, newUri }] },
							signal,
							10_000,
						),
					);
				} catch (error) {
					if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : error;
					serverNote = ` (${serverName} supplied no import edits)`;
				}
				const edit = appendFileRename(serverEdit, uri, newUri);
				if (!input.apply) {
					return {
						content: [
							{
								type: "text",
								text: `File rename preview: ${input.file} -> ${input.new_name}; ${describeWorkspaceEdit(edit)}${serverNote}`,
							},
						],
						details: { action: input.action, servers: [serverName] },
					};
				}
				const applied = await applyWorkspaceEdit(edit, cwd, { projectOnly });
				for (const [, targetClient] of clients) await notifyFileRenamed(targetClient, filePath, destinationPath);
				await syncAppliedWorkspaceEdit(edit, cwd, options.controls, signal);
				return {
					content: [{ type: "text", text: `${applied.join("\n")}${serverNote}` }],
					details: { action: input.action, servers: [serverName] },
				};
			}

			if (
				input.action === "call_hierarchy" ||
				input.action === "incoming_calls" ||
				input.action === "outgoing_calls"
			) {
				const prepared = parseCallHierarchyItems(
					await sendRequest(client, "textDocument/prepareCallHierarchy", params, signal),
				).filter((item) => !projectOnly || isLspUriInProject(item.uri, cwd));
				if (input.action === "call_hierarchy") {
					return {
						content: [{ type: "text", text: formatCallHierarchyItems(prepared, cwd) }],
						details: { action: input.action, servers: [serverName] },
					};
				}
				const item = selectCallHierarchyItem(prepared, input.query);
				if (!item) {
					return {
						content: [
							{
								type: "text",
								text: input.query
									? `No call hierarchy item matching "${input.query}"`
									: "No call hierarchy item found",
							},
						],
						details: { action: input.action, servers: [serverName] },
					};
				}
				const result = await sendRequest(
					client,
					input.action === "incoming_calls" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls",
					{ item },
					signal,
				);
				return {
					content: [
						{
							type: "text",
							text:
								input.action === "incoming_calls"
									? formatIncomingCalls(
											parseIncomingCalls(result).filter(
												(call) => !projectOnly || isLspUriInProject(call.from.uri, cwd),
											),
											cwd,
										)
									: formatOutgoingCalls(
											parseOutgoingCalls(result).filter(
												(call) => !projectOnly || isLspUriInProject(call.to.uri, cwd),
											),
											cwd,
										),
						},
					],
					details: { action: input.action, servers: [serverName] },
				};
			}

			if (input.action === "format") {
				const response = await sendRequest(
					client,
					"textDocument/formatting",
					{ textDocument: { uri }, options: { tabSize: 4, insertSpaces: true } },
					signal,
				);
				const edits = Array.isArray(response) ? response.filter(isTextEdit) : [];
				if (edits.length === 0) {
					return {
						content: [{ type: "text", text: "No formatting changes" }],
						details: { action: input.action, servers: [serverName] },
					};
				}
				const original = await readFile(filePath, "utf-8");
				const formatted = applyTextEditsToString(original, edits);
				if (!input.apply) {
					return {
						content: [{ type: "text", text: generateUnifiedPatch(input.file, original, formatted) }],
						details: { action: input.action, servers: [serverName] },
					};
				}
				await applyTextEdits(filePath, edits);
				for (const [, targetClient] of clients) {
					await syncContent(targetClient, filePath, formatted);
					await notifySaved(targetClient, filePath, formatted);
				}
				return {
					content: [{ type: "text", text: `Applied ${edits.length} formatting edit(s) to ${input.file}` }],
					details: { action: input.action, servers: [serverName] },
				};
			}

			if (input.action === "rename") {
				if (!input.new_name) throw new Error("rename requires new_name");
				const response = await sendRequest(
					client,
					"textDocument/rename",
					{ ...params, newName: input.new_name },
					signal,
				);
				const edit = asWorkspaceEdit(response);
				if (!edit) throw new Error("Language server did not return a rename edit");
				if (!input.apply) {
					return {
						content: [{ type: "text", text: `Rename preview: ${describeWorkspaceEdit(edit)}` }],
						details: { action: input.action, servers: [serverName] },
					};
				}
				const applied = await applyWorkspaceEdit(edit, cwd, { projectOnly });
				await syncAppliedWorkspaceEdit(edit, cwd, options.controls, signal);
				return {
					content: [{ type: "text", text: applied.join("\n") || "Rename returned no changes" }],
					details: { action: input.action, servers: [serverName] },
				};
			}

			if (input.action === "code_actions") {
				const diagnostics = (
					await Promise.all(
						clients.map(([, targetClient]) => waitForDiagnostics(targetClient, uri, { signal, timeoutMs: 500 })),
					)
				).flat();
				const response = await sendRequest(
					client,
					"textDocument/codeAction",
					{
						textDocument: { uri },
						range: { start: params.position, end: params.position },
						context: { diagnostics },
					},
					signal,
				);
				const query = input.query?.toLowerCase();
				const actions = asCodeActions(response).filter(
					(action) => !query || action.title.toLowerCase().includes(query),
				);
				if (!input.apply) {
					const output = actions.map(
						(action) =>
							`${action.isPreferred ? "* " : "- "}${action.title}${action.disabled ? ` (disabled: ${action.disabled.reason})` : ""}`,
					);
					return {
						content: [{ type: "text", text: output.join("\n") || "No code actions found" }],
						details: { action: input.action, servers: [serverName] },
					};
				}
				if (actions.length !== 1) {
					throw new Error(`apply=true requires query to match exactly one code action; matched ${actions.length}`);
				}
				let action = actions[0];
				if (action.disabled) throw new Error(`Code action is disabled: ${action.disabled.reason}`);
				if (!action.edit && action.data !== undefined) {
					const resolved = await sendRequest(client, "codeAction/resolve", action, signal);
					if (isRecord(resolved) && typeof resolved.title === "string")
						action = resolved as unknown as LspCodeAction;
				}
				if (projectOnly && action.command) {
					throw new Error(
						"LSP project-only mode blocks command-based code actions because their filesystem scope is unknown",
					);
				}
				const output: string[] = [];
				if (action.edit) {
					output.push(...(await applyWorkspaceEdit(action.edit, cwd, { projectOnly })));
					await syncAppliedWorkspaceEdit(action.edit, cwd, options.controls, signal);
				}
				if (action.command) {
					await sendRequest(
						client,
						"workspace/executeCommand",
						{ command: action.command.command, arguments: action.command.arguments ?? [] },
						signal,
					);
					output.push(`Executed ${action.command.title}`);
				}
				if (output.length === 0) throw new Error("Selected code action contained no edit or command");
				return {
					content: [{ type: "text", text: output.join("\n") }],
					details: { action: input.action, servers: [serverName] },
				};
			}

			const method = {
				hover: "textDocument/hover",
				definition: "textDocument/definition",
				type_definition: "textDocument/typeDefinition",
				implementation: "textDocument/implementation",
				references: "textDocument/references",
				symbols: "textDocument/documentSymbol",
			}[input.action];
			const result =
				input.action === "references"
					? await requestReferencesWithRetry(client, { ...params, context: { includeDeclaration: true } }, signal)
					: await sendRequest(client, method, params, signal);
			const visibleResult =
				projectOnly && input.action !== "hover" && input.action !== "symbols"
					? normalizeLocations(result).filter((location) => isLspUriInProject(location.uri, cwd))
					: result;
			const locations =
				input.action === "hover" || input.action === "symbols"
					? undefined
					: await addNavigationContext(parseNavigationLocations(visibleResult, cwd), cwd);
			const text =
				input.action === "hover"
					? formatHover(visibleResult)
					: input.action === "symbols"
						? formatSymbols(visibleResult)
						: formatNavigationLocations(locations ?? [], input.action, input.symbol);
			return {
				content: [{ type: "text", text }],
				details: { action: input.action, servers: [serverName], request: input, locations },
			};
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatLspCall(args, theme, context));
			return text;
		},
		renderResult(result, renderOptions, theme, context) {
			return renderLspResult(result, renderOptions, theme, context);
		},
	};
}

export function createLspTool(cwd: string, options?: LspToolOptions) {
	return wrapToolDefinition(createLspToolDefinition(cwd, options));
}
