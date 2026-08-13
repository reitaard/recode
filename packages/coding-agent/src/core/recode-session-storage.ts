import type {
	SessionEntryCursorOptions,
	SessionMetadata,
	SessionStats,
	SessionStorage,
	SessionTreeEntry,
} from "@reitaard/recode-agent-core";
import type { SessionManager } from "./session-manager.ts";

/** Uses the existing Recode JSONL session as AgentRuntime's durable session store. */
export class RecodeSessionStorage implements SessionStorage {
	private readonly manager: SessionManager;

	constructor(manager: SessionManager) {
		this.manager = manager;
	}

	async getMetadata(): Promise<SessionMetadata> {
		return {
			id: this.manager.getSessionId(),
			createdAt: this.manager.getHeader()?.timestamp ?? new Date().toISOString(),
		};
	}

	async getLeafId(): Promise<string | null> {
		return this.manager.getLeafId();
	}

	async setLeafId(leafId: string | null): Promise<void> {
		this.manager.appendEntry({
			type: "leaf",
			id: this.manager.createEntryId(),
			parentId: this.manager.getLeafId(),
			timestamp: new Date().toISOString(),
			targetId: leafId,
		});
	}

	async createEntryId(): Promise<string> {
		return this.manager.createEntryId();
	}

	async appendEntry(entry: SessionTreeEntry): Promise<void> {
		this.manager.appendEntry(entry);
	}

	async getEntry(id: string): Promise<SessionTreeEntry | undefined> {
		return this.manager.getEntry(id);
	}

	async findEntries<TType extends SessionTreeEntry["type"]>(
		type: TType,
	): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>> {
		return this.manager
			.getEntries()
			.filter((entry): entry is Extract<SessionTreeEntry, { type: TType }> => entry.type === type);
	}

	async getLabel(id: string): Promise<string | undefined> {
		return this.manager.getLabel(id);
	}

	async getSessionName(): Promise<string | undefined> {
		return this.manager.getSessionName();
	}

	async getSessionStats(): Promise<SessionStats> {
		let messageCount = 0;
		let cachedTokens = 0;
		let uncachedTokens = 0;
		let totalTokens = 0;
		let costTotal = 0;
		for (const entry of this.manager.getEntries()) {
			if (entry.type === "message") messageCount += 1;
			const usage =
				entry.type === "message"
					? entry.message.role === "assistant"
						? entry.message.usage
						: undefined
					: entry.type === "compaction" || entry.type === "branch_summary"
						? entry.usage
						: undefined;
			if (!usage) continue;
			cachedTokens += usage.cacheRead;
			uncachedTokens += usage.input + usage.cacheWrite;
			totalTokens += usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
			costTotal += usage.cost.total;
		}
		return { messageCount, cachedTokens, uncachedTokens, totalTokens, costTotal };
	}

	async getPathToRoot(leafId: string | null): Promise<SessionTreeEntry[]> {
		return leafId === null ? [] : this.manager.getBranch(leafId);
	}

	async getPathToRootOrCompaction(leafId: string | null): Promise<SessionTreeEntry[]> {
		if (leafId === null) return [];
		const branch = this.manager.getBranch(leafId);
		for (let index = branch.length - 1; index >= 0; index--) {
			const entry = branch[index];
			if (entry?.type === "compaction" && entry.retainedTail) return branch.slice(index);
		}
		return branch;
	}

	async getEntries(options?: SessionEntryCursorOptions): Promise<SessionTreeEntry[]> {
		let entries = this.manager.getEntries();
		if (options?.afterEntrySeq !== undefined) {
			entries = entries.filter((_entry, index) => index + 1 > options.afterEntrySeq!);
		}
		return options?.limit === undefined ? entries : entries.slice(0, options.limit);
	}
}
