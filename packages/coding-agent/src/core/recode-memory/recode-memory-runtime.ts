import { basename, dirname, join, resolve } from "node:path";
import type { Model } from "@reitaard/recode-ai";
import { getAgentDir } from "../../config.ts";
import type { ModelRegistry } from "../model-registry.ts";
import type { SessionManager } from "../session-manager.ts";
import {
	buildRecodeShioriReviewChunks,
	executeRecodeShiori,
	executeRecodeShioriFileReview,
	getRecodeShioriGreeting,
	type RecodeShioriMemoryCandidate,
	type RecodeShioriProgressEvent,
	type RecodeShioriRunResult,
	SHIORI_MAX_CHUNKS_PER_RUN,
	SHIORI_MAX_REVIEW_RETRIES,
} from "../workers/shiori/reviewer.ts";
import { RecodeMemoryManager } from "./recode-memory-manager.ts";
import type { RecodeMemoryConfig, RecodeMemoryScope } from "./recode-memory-types.ts";

interface ManagerEntry {
	manager: RecodeMemoryManager;
	includeProject: boolean;
}

export interface RecodeShioriRuntimeState {
	reviewing: boolean;
	failed: boolean;
}

export function resolveRecodeMemoryLocation(cwd: string): {
	managerKey: string;
	projectMemoryRoot: string;
} {
	const resolvedCwd = resolve(cwd);
	let current = resolvedCwd;
	while (true) {
		if (basename(current) === "memory" && basename(dirname(current)) === ".pi") {
			return {
				managerKey: dirname(dirname(current)),
				projectMemoryRoot: current,
			};
		}
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return {
		managerKey: resolvedCwd,
		projectMemoryRoot: join(resolvedCwd, ".pi", "memory"),
	};
}

/** Process-owned Kioku and Shiori lifecycle, independent of extension/session replacement. */
export class RecodeMemoryRuntime {
	private readonly managers = new Map<string, ManagerEntry>();
	private readonly activeShioriSessions = new Set<string>();
	private readonly shioriListeners = new Set<(state: RecodeShioriRuntimeState) => void>();
	private config?: RecodeMemoryConfig;

	setConfig(config: RecodeMemoryConfig): void {
		this.config = { ...config };
		for (const { manager } of this.managers.values()) manager.setConfig(this.config);
	}

	getConfig(): RecodeMemoryConfig {
		if (!this.config) throw new Error("Recode memory runtime has not been configured");
		return { ...this.config };
	}

	async getManager(cwd: string, includeProject: boolean): Promise<RecodeMemoryManager> {
		if (!this.config) throw new Error("Recode memory runtime has not been configured");
		const { managerKey: key, projectMemoryRoot } = resolveRecodeMemoryLocation(cwd);
		const existing = this.managers.get(key);
		if (existing && (existing.includeProject || !includeProject)) return existing.manager;
		if (existing) existing.manager.close();

		const manager = new RecodeMemoryManager({
			globalRoot: join(getAgentDir(), "memory"),
			projectRoot: projectMemoryRoot,
			databasePath: join(getAgentDir(), "recode-memory.sqlite"),
			config: this.config,
		});
		await manager.initialize(includeProject);
		this.managers.set(key, { manager, includeProject });
		return manager;
	}

	isShioriReviewing(): boolean {
		return this.activeShioriSessions.size > 0;
	}

	subscribeShiori(listener: (state: RecodeShioriRuntimeState) => void): () => void {
		this.shioriListeners.add(listener);
		return () => this.shioriListeners.delete(listener);
	}

	private emitShioriState(failed = false): void {
		const state = { reviewing: this.isShioriReviewing(), failed };
		for (const listener of this.shioriListeners) listener(state);
	}

	async runShiori(options: {
		cwd: string;
		sessionManager: SessionManager;
		modelRegistry: ModelRegistry;
		projectTrusted: boolean;
		model: Model<any>;
		chooseScope?: (
			candidate: RecodeShioriMemoryCandidate,
			globalAccess: boolean,
		) => Promise<RecodeMemoryScope | undefined>;
		onProgress?: (event: RecodeShioriProgressEvent) => void;
		appendMessage?: (message: string) => void;
	}): Promise<Awaited<ReturnType<typeof executeRecodeShiori>> | undefined> {
		const sessionId = options.sessionManager.getSessionId();
		if (this.isShioriReviewing()) return undefined;
		this.activeShioriSessions.add(sessionId);
		try {
			const result = await executeRecodeShiori({
				...options,
				config: this.getConfig(),
				manager: await this.getManager(options.cwd, options.projectTrusted),
				onProgress: (event) => {
					options.onProgress?.(event);
					if (event.type === "start") this.emitShioriState();
				},
			});
			this.activeShioriSessions.delete(sessionId);
			this.emitShioriState();
			return result;
		} catch (error) {
			this.activeShioriSessions.delete(sessionId);
			this.emitShioriState(true);
			throw error;
		}
	}

	async runShioriAll(options: {
		cwd: string;
		sessionManager: SessionManager;
		modelRegistry: ModelRegistry;
		projectTrusted: boolean;
		model: Model<any>;
		chooseScope?: (
			candidate: RecodeShioriMemoryCandidate,
			globalAccess: boolean,
		) => Promise<RecodeMemoryScope | undefined>;
		onProgress?: (event: RecodeShioriProgressEvent) => void;
		appendMessage?: (message: string) => void;
	}): Promise<RecodeShioriRunResult | undefined> {
		const sessionId = options.sessionManager.getSessionId();
		if (this.isShioriReviewing()) return undefined;
		const initial = buildRecodeShioriReviewChunks(options.sessionManager.getBranch());
		if (!initial.lastPendingEntryId) return undefined;
		this.activeShioriSessions.add(sessionId);
		this.emitShioriState();
		let reviewedEntries = 0;
		let saved = 0;
		let savedGlobal = 0;
		let savedProject = 0;
		let skippedDuplicates = 0;
		let lastReviewedEntryId = "";
		const greetingText = getRecodeShioriGreeting();
		let firstBatch = true;
		try {
			while (true) {
				let batch: RecodeShioriRunResult | undefined;
				let failure: unknown;
				for (let retry = 0; retry <= SHIORI_MAX_REVIEW_RETRIES; retry++) {
					try {
						batch = await executeRecodeShiori({
							...options,
							config: this.getConfig(),
							manager: await this.getManager(options.cwd, options.projectTrusted),
							maxChunks: SHIORI_MAX_CHUNKS_PER_RUN,
							throughEntryId: initial.lastPendingEntryId,
							reviewedEntriesBefore: reviewedEntries,
							totalEntries: initial.pendingEntries,
							greetingText,
							reportStart: firstBatch,
							appendMessages: false,
						});
						break;
					} catch (error) {
						failure = error;
					}
				}
				if (!batch) {
					const message = failure instanceof Error ? failure.message : String(failure);
					throw new Error(
						`Shiori review stopped after ${SHIORI_MAX_REVIEW_RETRIES} retries at ${reviewedEntries}/${initial.pendingEntries} entries: ${message}`,
					);
				}
				firstBatch = false;
				reviewedEntries += batch.reviewedEntries;
				saved += batch.saved;
				savedGlobal += batch.savedGlobal;
				savedProject += batch.savedProject;
				skippedDuplicates += batch.skippedDuplicates;
				lastReviewedEntryId = batch.lastReviewedEntryId;
				if (!batch.hasMore) break;
			}
			const completion = [
				`Reviewed ${reviewedEntries}/${initial.pendingEntries} entries`,
				saved === 0 ? "No new memories" : `Saved ${saved} ${saved === 1 ? "memory" : "memories"}`,
				savedProject > 0 ? `${savedProject} project` : undefined,
				savedGlobal > 0 ? `${savedGlobal} global` : undefined,
				skippedDuplicates > 0
					? `${skippedDuplicates} ${skippedDuplicates === 1 ? "duplicate" : "duplicates"} skipped`
					: undefined,
			]
				.filter((part): part is string => part !== undefined)
				.join(" · ");
			options.appendMessage?.(completion);
			options.onProgress?.({
				type: "complete",
				message: completion,
				reviewedEntries,
				totalEntries: initial.pendingEntries,
			});
			this.activeShioriSessions.delete(sessionId);
			this.emitShioriState();
			return {
				reviewedEntries,
				saved,
				savedGlobal,
				savedProject,
				skippedDuplicates,
				hasMore: false,
				lastReviewedEntryId,
			};
		} catch (error) {
			this.activeShioriSessions.delete(sessionId);
			this.emitShioriState(true);
			throw error;
		}
	}

	async runShioriFileReview(options: {
		cwd: string;
		sessionManager: SessionManager;
		modelRegistry: ModelRegistry;
		projectTrusted: boolean;
		model: Model<any>;
		sourcePath: string;
		content: string;
		chooseScope?: (
			candidate: RecodeShioriMemoryCandidate,
			globalAccess: boolean,
		) => Promise<RecodeMemoryScope | undefined>;
	}): Promise<Awaited<ReturnType<typeof executeRecodeShioriFileReview>> | undefined> {
		const sessionId = options.sessionManager.getSessionId();
		if (this.isShioriReviewing()) return undefined;
		this.activeShioriSessions.add(sessionId);
		this.emitShioriState();
		try {
			const result = await executeRecodeShioriFileReview({
				...options,
				config: this.getConfig(),
				manager: await this.getManager(options.cwd, options.projectTrusted),
			});
			this.activeShioriSessions.delete(sessionId);
			this.emitShioriState();
			return result;
		} catch (error) {
			this.activeShioriSessions.delete(sessionId);
			this.emitShioriState(true);
			throw error;
		}
	}

	close(): void {
		for (const { manager } of this.managers.values()) manager.close();
		this.managers.clear();
		this.shioriListeners.clear();
	}
}
