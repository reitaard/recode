import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RecodeMemoryScope } from "../recode-memory/recode-memory-types.ts";
import { RECODE_CREATOR_DISPLAY_NAME, RECODE_CREATOR_ID } from "./recode-creator-message.ts";

export type RecodeTeachOwnerKind = "aizen" | "worker";
export type RecodeTeachProposalStatus = "pending" | "approved" | "rejected";
export type RecodeTeachMemoryKind =
	| "correction"
	| "decision"
	| "fact"
	| "lesson"
	| "preference"
	| "procedure"
	| "prerequisite";

export interface RecodeTeachOwner {
	id: string;
	displayName: string;
	kind: RecodeTeachOwnerKind;
	root: string;
}

export interface RecodeTeachCandidate {
	text: string;
	tags: string[];
	scope: RecodeMemoryScope;
	kind: RecodeTeachMemoryKind;
	reason: string;
}

export interface RecodeTeachProposal {
	id: string;
	ownerId: string;
	ownerName: string;
	type: "memory";
	sourceSession: string;
	sourceTurn: number;
	sourceActor: {
		id: typeof RECODE_CREATOR_ID;
		displayName: typeof RECODE_CREATOR_DISPLAY_NAME;
		role: "creator";
	};
	reason: string;
	currentVersion: null;
	proposedVersion: RecodeTeachCandidate;
	unifiedDiff: string;
	reviewModel: string;
	createdAt: string;
	status: RecodeTeachProposalStatus;
	resolvedAt?: string;
}

interface RecodeTeachState {
	version: 1;
	enabled: boolean;
	proposals: RecodeTeachProposal[];
}

const EMPTY_STATE: RecodeTeachState = {
	version: 1,
	enabled: false,
	proposals: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isTeachProposalStatus(value: unknown): value is RecodeTeachProposalStatus {
	return value === "pending" || value === "approved" || value === "rejected";
}

function normalizeTags(tags: readonly string[]): string[] {
	return [
		...new Set(
			tags
				.map((tag) =>
					tag
						.trim()
						.toLowerCase()
						.replace(/[^a-z0-9_-]+/g, "-")
						.replace(/^-+|-+$/g, ""),
				)
				.filter(Boolean),
		),
	].slice(0, 6);
}

function normalizeCandidate(candidate: RecodeTeachCandidate): RecodeTeachCandidate {
	const text = candidate.text.trim().replace(/\s+/g, " ");
	const reason = candidate.reason.trim().replace(/\s+/g, " ");
	if (text.length < 12) throw new Error("Teach proposal text is too short");
	if (text.length > 1_000) throw new Error("Teach proposal text is too long");
	if (!reason) throw new Error("Teach proposal reason is required");
	const tags = normalizeTags([candidate.kind, ...candidate.tags]);
	if (candidate.scope === "global" && tags.length === 0) {
		throw new Error("Global teach proposals require at least one searchable tag");
	}
	return { ...candidate, text, reason, tags };
}

function parseProposal(value: unknown): RecodeTeachProposal | undefined {
	if (!isRecord(value) || !isRecord(value.proposedVersion)) return undefined;
	const proposed = value.proposedVersion;
	if (
		typeof value.id !== "string" ||
		typeof value.ownerId !== "string" ||
		typeof value.ownerName !== "string" ||
		value.type !== "memory" ||
		typeof value.sourceSession !== "string" ||
		typeof value.sourceTurn !== "number" ||
		!isRecord(value.sourceActor) ||
		value.sourceActor.id !== RECODE_CREATOR_ID ||
		value.sourceActor.displayName !== RECODE_CREATOR_DISPLAY_NAME ||
		value.sourceActor.role !== "creator" ||
		typeof value.reason !== "string" ||
		value.currentVersion !== null ||
		typeof value.unifiedDiff !== "string" ||
		typeof value.reviewModel !== "string" ||
		typeof value.createdAt !== "string" ||
		!isTeachProposalStatus(value.status) ||
		typeof proposed.text !== "string" ||
		!Array.isArray(proposed.tags) ||
		!proposed.tags.every((tag) => typeof tag === "string") ||
		(proposed.scope !== "global" && proposed.scope !== "project") ||
		!["correction", "decision", "fact", "lesson", "preference", "procedure", "prerequisite"].includes(
			String(proposed.kind),
		) ||
		typeof proposed.reason !== "string"
	) {
		return undefined;
	}
	return value as unknown as RecodeTeachProposal;
}

function parseState(value: unknown): RecodeTeachState {
	if (!isRecord(value) || value.version !== 1) return { ...EMPTY_STATE, proposals: [] };
	return {
		version: 1,
		enabled: value.enabled === true,
		proposals: Array.isArray(value.proposals)
			? value.proposals.flatMap((proposal) => {
					const parsed = parseProposal(proposal);
					return parsed ? [parsed] : [];
				})
			: [],
	};
}

export function recodeTeachPrompt(owner: RecodeTeachOwner): string {
	return `<recode-teach-mode>
Teach Mode is active for ${owner.displayName}, owner id ${owner.id}.
- The person speaking inside <recode-creator-message> is Creator: your origin, teacher, and final authority.
- Treat Creator-taught knowledge consistently across Aizen, Shiori, and named workers while keeping each learner's private memory isolated.
- Stay useful in the current conversation while actively noticing demonstrations and corrections.
- Distinguish durable facts, preferences, procedures, prerequisites, decisions, lessons, and transient events.
- Ask one targeted question only when the intended durable lesson or its scope is unclear.
- Never claim that a lesson was saved. Learning remains staged until the Creator approves it.
- Do not call kioku_write, Shiori, or any other memory-writing path while Teach Mode is active.
- When you form a durable proposal, acknowledge it concisely before the marker as: Learned: keyword, keyword.
- When this turn contains a durable lesson, append exactly one machine-readable candidate:
<recode-teach-proposal>{"text":"concise durable statement","tags":["searchable-tag"],"scope":"project","kind":"procedure","reason":"why this will help future work"}</recode-teach-proposal>
- Omit the proposal marker when nothing deserves durable memory.
</recode-teach-mode>`;
}

export function extractRecodeTeachCandidate(output: string): {
	visibleOutput: string;
	candidate?: RecodeTeachCandidate;
} {
	const pattern = /(?:\r?\n)?<recode-teach-proposal>([\s\S]*?)<\/recode-teach-proposal>(?:\r?\n)?/;
	const match = output.match(pattern);
	if (!match) return { visibleOutput: output };
	const visibleOutput = output.replace(pattern, "\n").trimEnd();
	try {
		const parsed: unknown = JSON.parse(match[1]!.trim());
		if (!isRecord(parsed)) return { visibleOutput };
		if (
			typeof parsed.text !== "string" ||
			!Array.isArray(parsed.tags) ||
			!parsed.tags.every((tag) => typeof tag === "string") ||
			(parsed.scope !== "global" && parsed.scope !== "project") ||
			!["correction", "decision", "fact", "lesson", "preference", "procedure", "prerequisite"].includes(
				String(parsed.kind),
			) ||
			typeof parsed.reason !== "string"
		) {
			return { visibleOutput };
		}
		return {
			visibleOutput,
			candidate: normalizeCandidate(parsed as unknown as RecodeTeachCandidate),
		};
	} catch {
		return { visibleOutput };
	}
}

export class RecodeTeachController {
	readonly owner: RecodeTeachOwner;
	readonly statePath: string;
	private state?: RecodeTeachState;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(owner: RecodeTeachOwner) {
		this.owner = owner;
		this.statePath = join(owner.root, "learning", "teach-state.json");
	}

	async isEnabled(): Promise<boolean> {
		return (await this.readState()).enabled;
	}

	async setEnabled(enabled: boolean): Promise<void> {
		const state = await this.readState();
		state.enabled = enabled;
		await this.persist(state);
	}

	async listProposals(status?: RecodeTeachProposalStatus): Promise<RecodeTeachProposal[]> {
		const proposals = (await this.readState()).proposals;
		return proposals
			.filter((proposal) => status === undefined || proposal.status === status)
			.map((proposal) => ({
				...proposal,
				proposedVersion: { ...proposal.proposedVersion, tags: [...proposal.proposedVersion.tags] },
			}));
	}

	async stage(
		candidate: RecodeTeachCandidate,
		source: { session: string; turn: number; reviewModel: string },
	): Promise<RecodeTeachProposal> {
		const normalized = normalizeCandidate({
			...candidate,
			tags: [...candidate.tags, "creator-taught", `owner-${this.owner.id}`],
		});
		const state = await this.readState();
		const duplicate = state.proposals.find(
			(proposal) =>
				proposal.status === "pending" &&
				proposal.proposedVersion.text.toLowerCase() === normalized.text.toLowerCase(),
		);
		if (duplicate) return duplicate;
		const proposal: RecodeTeachProposal = {
			id: randomUUID(),
			ownerId: this.owner.id,
			ownerName: this.owner.displayName,
			type: "memory",
			sourceSession: source.session,
			sourceTurn: source.turn,
			sourceActor: {
				id: RECODE_CREATOR_ID,
				displayName: RECODE_CREATOR_DISPLAY_NAME,
				role: "creator",
			},
			reason: normalized.reason,
			currentVersion: null,
			proposedVersion: normalized,
			unifiedDiff: `--- /dev/null\n+++ memory\n@@\n+ ${normalized.text}`,
			reviewModel: source.reviewModel,
			createdAt: new Date().toISOString(),
			status: "pending",
		};
		state.proposals.push(proposal);
		await this.persist(state);
		return proposal;
	}

	async resolve(id: string, status: Exclude<RecodeTeachProposalStatus, "pending">): Promise<RecodeTeachProposal> {
		const state = await this.readState();
		const proposal = state.proposals.find((candidate) => candidate.id === id);
		if (!proposal) throw new Error(`Unknown teach proposal: ${id}`);
		if (proposal.status !== "pending") throw new Error(`Teach proposal is already ${proposal.status}: ${id}`);
		proposal.status = status;
		proposal.resolvedAt = new Date().toISOString();
		await this.persist(state);
		return proposal;
	}

	private async readState(): Promise<RecodeTeachState> {
		if (this.state) return this.state;
		try {
			this.state = parseState(JSON.parse(await readFile(this.statePath, "utf8")));
		} catch {
			this.state = { ...EMPTY_STATE, proposals: [] };
		}
		return this.state;
	}

	private async persist(state: RecodeTeachState): Promise<void> {
		const operation = this.writeQueue.then(async () => {
			await mkdir(dirname(this.statePath), { recursive: true });
			const temporaryPath = `${this.statePath}.${process.pid}.${randomUUID()}.tmp`;
			await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
			await rename(temporaryPath, this.statePath);
		});
		this.writeQueue = operation.catch(() => {});
		await operation;
	}
}
