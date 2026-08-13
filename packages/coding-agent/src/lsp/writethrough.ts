/** Post-mutation diagnostics bridge adapted from can1357/oh-my-pi (MIT). */

import { getOrCreateClient, notifySaved, syncContent, waitForDiagnostics } from "./client.ts";
import { getServersForFile, type LspControlSettings, loadLspConfig } from "./config.ts";
import {
	beginLspDiagnostics,
	completeLspDiagnostics,
	formatGroupedLspDiagnostics,
	getLspDiagnosticSnapshot,
	type LspDiagnosticEntry,
} from "./diagnostics.ts";
import { fileToUri } from "./utils.ts";

const INLINE_DIAGNOSTICS_WAIT_MS = 3_000;
const DEFERRED_DIAGNOSTICS_WAIT_MS = 12_000;
const SERVER_INITIALIZE_TIMEOUT_MS = 5_000;

export interface LspFileDiagnosticsResult {
	summary: string;
	messages: string[];
	errored: boolean;
	servers: string[];
	checking?: boolean;
}

export type LspWritethrough = (
	absolutePath: string,
	content: string,
	signal?: AbortSignal,
) => Promise<LspFileDiagnosticsResult | undefined>;

export async function runLspWritethroughAfterMutation(
	writethrough: LspWritethrough | undefined,
	absolutePath: string,
	content: string,
	signal?: AbortSignal,
): Promise<LspFileDiagnosticsResult | undefined> {
	if (!writethrough) return undefined;
	try {
		return await writethrough(absolutePath, content, signal);
	} catch (error) {
		return {
			summary: "LSP: diagnostics unavailable after successful write",
			messages: [`LSP unavailable: ${error instanceof Error ? error.message : String(error)}`],
			errored: false,
			servers: [],
		};
	}
}

interface CollectedDiagnostics {
	entries: LspDiagnosticEntry[];
	failures: string[];
}

async function collectDiagnostics(
	absolutePath: string,
	content: string,
	cwd: string,
	servers: ReturnType<typeof getServersForFile>,
): Promise<CollectedDiagnostics> {
	const deadline = Date.now() + DEFERRED_DIAGNOSTICS_WAIT_MS;
	const results = await Promise.all(
		servers.map(async ([name, config]) => {
			try {
				const client = await getOrCreateClient(config, cwd, {
					initializeTimeoutMs: SERVER_INITIALIZE_TIMEOUT_MS,
				});
				const expectedVersion = await syncContent(client, absolutePath, content);
				await notifySaved(client, absolutePath, content);
				const diagnostics = await waitForDiagnostics(client, fileToUri(absolutePath), {
					expectedVersion,
					timeoutMs: Math.max(0, deadline - Date.now()),
				});
				return {
					entries: diagnostics.map((diagnostic) => ({ filePath: absolutePath, diagnostic, server: name })),
					failure: undefined,
				};
			} catch (error) {
				return {
					entries: [] satisfies LspDiagnosticEntry[],
					failure: `${name}: ${error instanceof Error ? error.message : String(error)}`,
				};
			}
		}),
	);
	return {
		entries: results.flatMap((result) => result.entries),
		failures: results.flatMap((result) => (result.failure ? [result.failure] : [])),
	};
}

function formatResult(
	cwd: string,
	absolutePath: string,
	servers: string[],
	checking: boolean,
): LspFileDiagnosticsResult {
	const snapshot = getLspDiagnosticSnapshot(cwd, absolutePath);
	if (!snapshot || snapshot.state === "checking" || checking) {
		return {
			summary: "LSP: checking in background",
			messages: [],
			errored: false,
			servers,
			checking: true,
		};
	}
	const formatted = formatGroupedLspDiagnostics(snapshot.entries, cwd);
	const messages = [...formatted.messages];
	if (snapshot.failures.length > 0) {
		messages.push(...snapshot.failures.map((failure) => `LSP unavailable: ${failure}`));
	}
	return {
		summary:
			snapshot.state === "error" && snapshot.failures.length === servers.length
				? "LSP: all matching servers failed"
				: formatted.summary,
		messages,
		errored: snapshot.state === "error" || formatted.errored,
		servers,
		checking: false,
	};
}

export function createLspWritethrough(cwd: string, controls?: LspControlSettings): LspWritethrough {
	return async (absolutePath, content, signal) => {
		if (signal?.aborted) {
			throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
		}
		const servers = getServersForFile(loadLspConfig(cwd, undefined, controls), absolutePath);
		if (servers.length === 0) return undefined;
		const generation = beginLspDiagnostics(cwd, absolutePath);
		const collection = collectDiagnostics(absolutePath, content, cwd, servers).then((collected) => {
			completeLspDiagnostics(cwd, absolutePath, generation, collected.entries, collected.failures);
			return collected;
		});
		let timeout: NodeJS.Timeout | undefined;
		const inline = await Promise.race([
			collection.then(() => true),
			new Promise<false>((resolve) => {
				timeout = setTimeout(() => resolve(false), INLINE_DIAGNOSTICS_WAIT_MS);
			}),
		]);
		if (timeout) clearTimeout(timeout);
		return formatResult(
			cwd,
			absolutePath,
			servers.map(([name]) => name),
			!inline,
		);
	};
}
