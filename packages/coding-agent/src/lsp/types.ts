/**
 * LSP protocol types adapted from can1357/oh-my-pi (MIT).
 * The Recode port keeps this boundary runtime-agnostic so Node and Bun builds
 * share the same client implementation.
 */

import type { ChildProcessWithoutNullStreams } from "node:child_process";

export type LspServerState = "unstarted" | "starting" | "ready" | "backoff" | "error" | "disabled" | "stopped";

export interface LspServerConfig {
	command: string;
	args?: string[];
	env?: Record<string, string>;
	fileTypes: string[];
	rootMarkers?: string[];
	initOptions?: Record<string, unknown>;
	settings?: Record<string, unknown>;
	disabled?: boolean;
	timeoutMs?: number;
	warmupTimeoutMs?: number;
	useLspmux?: boolean;
	isLinter?: boolean;
	resolvedCommand?: string;
	projectOnly?: boolean;
	capabilities?: {
		flycheck?: boolean;
		ssr?: boolean;
		expandMacro?: boolean;
		runnables?: boolean;
		relatedTests?: boolean;
	};
}

export interface LspJsonRpcRequest {
	jsonrpc: "2.0";
	id: number;
	method: string;
	params?: unknown;
}

export interface LspJsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: unknown;
}

export interface LspJsonRpcResponse {
	jsonrpc: "2.0";
	id: number;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

export interface LspDiagnostic {
	range: {
		start: { line: number; character: number };
		end: { line: number; character: number };
	};
	severity?: 1 | 2 | 3 | 4;
	code?: string | number;
	source?: string;
	message: string;
}

export interface LspPosition {
	line: number;
	character: number;
}

export interface LspRange {
	start: LspPosition;
	end: LspPosition;
}

export interface LspLocation {
	uri: string;
	range: LspRange;
}

export interface LspLocationLink {
	targetUri: string;
	targetSelectionRange: LspRange;
}

export interface LspSymbolInformation {
	name: string;
	kind?: number;
	containerName?: string;
	location: LspLocation | { uri: string };
}

export interface LspCallHierarchyItem {
	name: string;
	kind?: number;
	tags?: number[];
	detail?: string;
	uri: string;
	range: LspRange;
	selectionRange: LspRange;
	data?: unknown;
}

export interface LspCallHierarchyIncomingCall {
	from: LspCallHierarchyItem;
	fromRanges: LspRange[];
}

export interface LspCallHierarchyOutgoingCall {
	to: LspCallHierarchyItem;
	fromRanges: LspRange[];
}

export interface LspTextEdit {
	range: LspRange;
	newText: string;
}

export interface LspTextDocumentEdit {
	textDocument: { uri: string; version?: number | null };
	edits: LspTextEdit[];
}

export interface LspCreateFile {
	kind: "create";
	uri: string;
	options?: { overwrite?: boolean; ignoreIfExists?: boolean };
}

export interface LspRenameFile {
	kind: "rename";
	oldUri: string;
	newUri: string;
	options?: { overwrite?: boolean; ignoreIfExists?: boolean };
}

export interface LspDeleteFile {
	kind: "delete";
	uri: string;
	options?: { recursive?: boolean; ignoreIfNotExists?: boolean };
}

export type LspDocumentChange = LspTextDocumentEdit | LspCreateFile | LspRenameFile | LspDeleteFile;

export interface LspWorkspaceEdit {
	changes?: Record<string, LspTextEdit[]>;
	documentChanges?: LspDocumentChange[];
}

export interface LspCommand {
	title: string;
	command: string;
	arguments?: unknown[];
}

export interface LspCodeAction {
	title: string;
	kind?: string;
	diagnostics?: LspDiagnostic[];
	isPreferred?: boolean;
	disabled?: { reason: string };
	edit?: LspWorkspaceEdit;
	command?: LspCommand;
	data?: unknown;
}

export interface PublishDiagnosticsParams {
	uri: string;
	version?: number;
	diagnostics: LspDiagnostic[];
}

export interface LspWorkspaceDocumentDiagnosticReport {
	uri: string;
	version?: number | null;
	kind: "full" | "unchanged";
	items?: LspDiagnostic[];
	resultId?: string;
}

export interface LspWorkspaceDiagnosticReport {
	items: LspWorkspaceDocumentDiagnosticReport[];
}

export interface LspPendingRequest {
	method: string;
	resolve(value: unknown): void;
	reject(error: Error): void;
}

export interface LspClient {
	key: string;
	name: string;
	cwd: string;
	config: LspServerConfig;
	process: ChildProcessWithoutNullStreams;
	requestId: number;
	state: LspServerState;
	serverCapabilities?: Record<string, unknown>;
	pendingRequests: Map<number, LspPendingRequest>;
	diagnostics: Map<string, { diagnostics: LspDiagnostic[]; version: number | null }>;
	diagnosticsVersion: number;
	activeProgressTokens: Set<string | number>;
	progressVersion: number;
	openFiles: Map<string, { version: number; languageId: string; content: string }>;
	writeQueue: Promise<void>;
	stderr: string;
	lastActivity: number;
}

export interface LspServerStatus {
	name: string;
	state: LspServerState;
	fileTypes: string[];
	error?: string;
	restartAttempt?: number;
	retryAt?: number;
}

export interface LspmuxState {
	available: boolean;
	running: boolean;
	binaryPath: string | null;
}

export interface LspmuxWrappedCommand {
	command: string;
	args: string[];
	env?: Record<string, string>;
}
