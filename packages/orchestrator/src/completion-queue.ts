import { randomUUID } from "node:crypto";
import { loadCompletions, saveCompletions } from "./storage.ts";
import type { CompletionRecord, CompletionTerminalState } from "./types.ts";

const DEFAULT_CLAIM_LEASE_MS = 30_000;
const DEFAULT_ACKNOWLEDGED_RETENTION_MS = 60 * 60 * 1_000;
const DEFAULT_MAX_ENTRIES = 256;
const MAX_SUMMARY_CHARS = 4_000;

export interface CompletionQueueStorage {
	load(): CompletionRecord[];
	save(records: CompletionRecord[]): void;
}

export interface CompletionQueueOptions {
	storage?: CompletionQueueStorage;
	claimLeaseMs?: number;
	acknowledgedRetentionMs?: number;
	maxEntries?: number;
	now?: () => Date;
}

export interface EnqueueCompletionInput {
	parentInstanceId?: string;
	parentSessionId?: string;
	childInstanceId: string;
	childSessionId?: string;
	terminalState: CompletionTerminalState;
	summary?: string;
	resultHash: string;
	completedAt: string;
}

export interface CompletionParentIdentity {
	instanceId?: string;
	sessionId?: string;
}

export interface CompletionClaim {
	record: Readonly<CompletionRecord>;
	owner: string;
	generation: number;
}

function cloneRecord(record: CompletionRecord): CompletionRecord {
	return { ...record };
}

function requireBoundedIdentity(name: string, value: string | undefined, required = false): void {
	if ((required && value === undefined) || (value !== undefined && (!value || value.length > 512))) {
		throw new Error(`${name} must contain 1 to 512 characters`);
	}
}

function matchesParent(record: CompletionRecord, parent: CompletionParentIdentity): boolean {
	if (record.parentInstanceId !== undefined) return record.parentInstanceId === parent.instanceId;
	return record.parentSessionId === parent.sessionId;
}

export class MaestroCompletionQueue {
	private readonly storage: CompletionQueueStorage;
	private readonly claimLeaseMs: number;
	private readonly acknowledgedRetentionMs: number;
	private readonly maxEntries: number;
	private readonly now: () => Date;

	constructor(options: CompletionQueueOptions = {}) {
		this.storage = options.storage ?? { load: loadCompletions, save: saveCompletions };
		this.claimLeaseMs = options.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS;
		this.acknowledgedRetentionMs = options.acknowledgedRetentionMs ?? DEFAULT_ACKNOWLEDGED_RETENTION_MS;
		this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
		this.now = options.now ?? (() => new Date());
		for (const [name, value] of [
			["claimLeaseMs", this.claimLeaseMs],
			["acknowledgedRetentionMs", this.acknowledgedRetentionMs],
		] as const) {
			if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative finite number`);
		}
		if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1 || this.maxEntries > 1_024) {
			throw new Error("maxEntries must be a safe integer between 1 and 1024");
		}
	}

	enqueue(input: EnqueueCompletionInput): CompletionRecord {
		this.validateInput(input);
		const records = this.cleanupAcknowledged(this.storage.load());
		const existing = records.find((record) => record.childInstanceId === input.childInstanceId);
		if (existing) {
			if (
				existing.resultHash !== input.resultHash ||
				existing.parentInstanceId !== input.parentInstanceId ||
				existing.parentSessionId !== input.parentSessionId
			) {
				throw new Error(`Conflicting completion already exists for child ${input.childInstanceId}`);
			}
			return cloneRecord(existing);
		}
		if (records.length >= this.maxEntries) {
			const unacknowledged = records.filter((record) => record.deliveryState !== "acknowledged");
			if (unacknowledged.length !== records.length) {
				records.splice(0, records.length, ...unacknowledged);
				this.storage.save(records);
			}
		}
		if (records.length >= this.maxEntries) {
			throw new Error("Maestro completion queue capacity reached; refusing to drop an unacknowledged completion");
		}
		const createdAt = this.now().toISOString();
		const record: CompletionRecord = {
			id: randomUUID(),
			parentInstanceId: input.parentInstanceId,
			parentSessionId: input.parentSessionId,
			childInstanceId: input.childInstanceId,
			childSessionId: input.childSessionId,
			terminalState: input.terminalState,
			summary: input.summary?.trim().slice(0, MAX_SUMMARY_CHARS) || undefined,
			resultHash: input.resultHash,
			completedAt: input.completedAt,
			createdAt,
			deliveryState: "pending",
			claimGeneration: 0,
		};
		records.push(record);
		this.storage.save(records);
		return cloneRecord(record);
	}

	claim(parent: CompletionParentIdentity, owner: string, limit = 16): CompletionClaim[] {
		requireBoundedIdentity("parent.instanceId", parent.instanceId);
		requireBoundedIdentity("parent.sessionId", parent.sessionId);
		if (!parent.instanceId && !parent.sessionId) throw new Error("A parent instance or session identity is required");
		requireBoundedIdentity("owner", owner, true);
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64) {
			throw new Error("limit must be a safe integer between 1 and 64");
		}
		const now = this.now();
		const records = this.cleanupAcknowledged(this.storage.load(), now);
		const claims: CompletionClaim[] = [];
		for (const record of records) {
			if (claims.length >= limit || !matchesParent(record, parent) || record.deliveryState === "acknowledged")
				continue;
			if (
				record.deliveryState === "claimed" &&
				record.claimOwner !== owner &&
				record.claimedAt &&
				Date.parse(record.claimedAt) + this.claimLeaseMs > now.getTime()
			) {
				continue;
			}
			record.deliveryState = "claimed";
			record.claimOwner = owner;
			record.claimGeneration += 1;
			record.claimedAt = now.toISOString();
			record.acknowledgedAt = undefined;
			claims.push({ record: cloneRecord(record), owner, generation: record.claimGeneration });
		}
		if (claims.length > 0) this.storage.save(records);
		return claims;
	}

	acknowledge(claim: CompletionClaim): boolean {
		const records = this.storage.load();
		const record = records.find((candidate) => candidate.id === claim.record.id);
		if (!record || record.claimOwner !== claim.owner || record.claimGeneration !== claim.generation) return false;
		if (record.deliveryState === "acknowledged") return true;
		if (record.deliveryState !== "claimed") return false;
		record.deliveryState = "acknowledged";
		record.acknowledgedAt = this.now().toISOString();
		this.storage.save(records);
		return true;
	}

	release(claim: CompletionClaim): boolean {
		const records = this.storage.load();
		const record = records.find((candidate) => candidate.id === claim.record.id);
		if (
			!record ||
			record.deliveryState !== "claimed" ||
			record.claimOwner !== claim.owner ||
			record.claimGeneration !== claim.generation
		) {
			return false;
		}
		record.deliveryState = "pending";
		record.claimOwner = undefined;
		record.claimedAt = undefined;
		this.storage.save(records);
		return true;
	}

	list(parent?: CompletionParentIdentity): CompletionRecord[] {
		const records = this.cleanupAcknowledged(this.storage.load());
		return records.filter((record) => !parent || matchesParent(record, parent)).map(cloneRecord);
	}

	private cleanupAcknowledged(records: CompletionRecord[], now = this.now()): CompletionRecord[] {
		const cutoff = now.getTime() - this.acknowledgedRetentionMs;
		const retained = records.filter(
			(record) =>
				record.deliveryState !== "acknowledged" ||
				record.acknowledgedAt === undefined ||
				Date.parse(record.acknowledgedAt) >= cutoff,
		);
		if (retained.length !== records.length) this.storage.save(retained);
		return retained;
	}

	private validateInput(input: EnqueueCompletionInput): void {
		requireBoundedIdentity("parentInstanceId", input.parentInstanceId);
		requireBoundedIdentity("parentSessionId", input.parentSessionId);
		if (!input.parentInstanceId && !input.parentSessionId) {
			throw new Error("A parent instance or session identity is required");
		}
		requireBoundedIdentity("childInstanceId", input.childInstanceId, true);
		requireBoundedIdentity("childSessionId", input.childSessionId);
		if (
			!new Set<CompletionTerminalState>(["SUCCEEDED", "FAILED", "INTERRUPTED", "CANCELLED"]).has(input.terminalState)
		) {
			throw new Error(`Unsupported completion terminal state: ${input.terminalState}`);
		}
		if (!/^[a-f0-9]{64}$/.test(input.resultHash))
			throw new Error("resultHash must be a lowercase SHA-256 hex digest");
		if (!Number.isFinite(Date.parse(input.completedAt))) throw new Error("completedAt must be a valid timestamp");
	}
}
