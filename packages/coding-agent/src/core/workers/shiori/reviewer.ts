import type { Model } from "@reitaard/recode-ai";
import type { ModelRegistry } from "../../model-registry.ts";
import { admitRecodeCardinalMemory } from "../../recode-memory/recode-cardinal.ts";
import type { RecodeMemoryManager } from "../../recode-memory/recode-memory-manager.ts";
import type {
	RecodeMemoryConfig,
	RecodeMemoryScope,
	RecodeShioriRouting,
} from "../../recode-memory/recode-memory-types.ts";
import type { SessionEntry, SessionManager } from "../../session-manager.ts";
import { runRecodeShioriHarness } from "./harness.ts";

export const RECODE_SHIORI_CHECKPOINT = "recode-shiori-checkpoint";
export const RECODE_SHIORI_DISPLAY_NAME = "Shiori (\u681e)";
export const RECODE_SHIORI_MESSAGE_ENTRY = "recode-shiori-message";

export interface RecodeShioriMessageEntry {
	message: string;
}

export function appendRecodeShioriMessage(sessionManager: SessionManager, message: string): void {
	sessionManager.appendCustomEntry(RECODE_SHIORI_MESSAGE_ENTRY, {
		message,
	} satisfies RecodeShioriMessageEntry);
}

export interface RecodeShioriProgressEvent {
	type: "start" | "progress" | "complete";
	message: string;
	reviewedEntries?: number;
	totalEntries?: number;
}

const SHIORI_MEMORY_GREETINGS = [
	"Your memory is safe within my pages.",
	"Another memory for the archive.",
	"Let me preserve this fragment.",
	"I'll bind it to our story.",
	"Leave it with me. I'll keep it safe.",
	"I've saved it for later.",
	"Noted. You can ask me about it anytime.",
	"Saved. I won't bring it up unless it's useful.",
] as const;

const SHIORI_CHUNK_CHARACTERS = 24_000;
export const SHIORI_MAX_CHUNKS_PER_RUN = 4;
export const SHIORI_MAX_REVIEW_RETRIES = 3;
const SHIORI_MAX_MEMORIES_PER_CHUNK = 10;

export function getRecodeShioriGreeting(now = new Date(), random = Math.random): string {
	const hour = now.getHours();
	const period = hour >= 5 && hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
	const index = Math.min(
		SHIORI_MEMORY_GREETINGS.length - 1,
		Math.floor(Math.max(0, random()) * SHIORI_MEMORY_GREETINGS.length),
	);
	return `Good ${period}. ${SHIORI_MEMORY_GREETINGS[index]}`;
}

function buildRecodeShioriSystemPrompt(now: Date): string {
	const localDateTime = now.toLocaleString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short",
	});
	return `You are ${RECODE_SHIORI_DISPLAY_NAME}, Recode's focused memory reviewer.
Current local date and time: ${localDateTime}.
Extract only durable, useful knowledge from the supplied transcript: user preferences and behavior, corrections, project decisions, stable workflows, verified facts, and lessons.
Ignore greetings, transient status, guesses, secrets, credentials, raw logs, and details that will not help a future session.
Return strict JSON only. Do not use Markdown.`;
}

export interface RecodeShioriMemoryCandidate {
	text: string;
	tags: string[];
	scope: RecodeMemoryScope;
	kind: "correction" | "decision" | "fact" | "lesson" | "preference" | "workflow";
	confidence: number;
	evidenceEntryIds: string[];
}

export interface RecodeShioriCheckpoint {
	lastReviewedEntryId: string;
	reviewedAt: string;
	saved: number;
}

interface RecodeShioriReviewChunk {
	entries: SessionEntry[];
	transcript: string;
}

export interface RecodeShioriRunResult {
	reviewedEntries: number;
	saved: number;
	savedGlobal: number;
	savedProject: number;
	skippedDuplicates: number;
	hasMore: boolean;
	lastReviewedEntryId: string;
}

export interface RecodeShioriFileReviewResult {
	reviewedCharacters: number;
	saved: number;
	savedGlobal: number;
	savedProject: number;
	skippedDuplicates: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/#[\w-]+|\[\[[^\]]+\]\]/g, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

function contentText(value: unknown): string {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return "";
	return value
		.map((item) => {
			if (!isRecord(item)) return "";
			if (item.type === "text" && typeof item.text === "string") return item.text;
			if (item.type === "toolCall" && typeof item.name === "string") {
				const argumentsText = isRecord(item.arguments) ? JSON.stringify(item.arguments) : "";
				return `[tool ${item.name}${argumentsText ? ` ${argumentsText}` : ""}]`;
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function renderEntry(entry: SessionEntry): string | undefined {
	if (entry.type !== "message") return undefined;
	const message = entry.message;
	if (message.role === "user") {
		const text = contentText(message.content).trim();
		return text ? `[${entry.id}] USER\n${text}` : undefined;
	}
	if (message.role === "assistant") {
		const text = contentText(message.content).trim();
		return text ? `[${entry.id}] ASSISTANT\n${text}` : undefined;
	}
	if (message.role === "toolResult") {
		const text = contentText(message.content).trim();
		const clipped =
			text.length > 2000 ? `${text.slice(0, 1600)}\n...[tool output clipped]...\n${text.slice(-300)}` : text;
		return `[${entry.id}] TOOL ${message.toolName}${message.isError ? " ERROR" : ""}\n${clipped || "(no text)"}`;
	}
	return undefined;
}

function checkpointFromEntry(entry: SessionEntry): RecodeShioriCheckpoint | undefined {
	if (entry.type !== "custom" || entry.customType !== RECODE_SHIORI_CHECKPOINT || !isRecord(entry.data))
		return undefined;
	if (typeof entry.data.lastReviewedEntryId !== "string" || typeof entry.data.reviewedAt !== "string")
		return undefined;
	return {
		lastReviewedEntryId: entry.data.lastReviewedEntryId,
		reviewedAt: entry.data.reviewedAt,
		saved: typeof entry.data.saved === "number" ? entry.data.saved : 0,
	};
}

export function getRecodeShioriCheckpoint(branch: SessionEntry[]): RecodeShioriCheckpoint | undefined {
	for (let index = branch.length - 1; index >= 0; index--) {
		const checkpoint = checkpointFromEntry(branch[index]!);
		if (checkpoint) return checkpoint;
	}
	return undefined;
}

export function buildRecodeShioriReviewChunks(
	branch: SessionEntry[],
	options: { maxChunks?: number; throughEntryId?: string } = {},
): {
	chunks: RecodeShioriReviewChunk[];
	pendingEntries: number;
	lastPendingEntryId?: string;
	hasMore: boolean;
} {
	const checkpoint = getRecodeShioriCheckpoint(branch);
	const checkpointIndex = checkpoint ? branch.findIndex((entry) => entry.id === checkpoint.lastReviewedEntryId) : -1;
	const pendingEntries = branch.slice(checkpointIndex + 1).filter((entry) => renderEntry(entry) !== undefined);
	const throughIndex = options.throughEntryId
		? pendingEntries.findIndex((entry) => entry.id === options.throughEntryId)
		: -1;
	const pending = throughIndex === -1 ? pendingEntries : pendingEntries.slice(0, throughIndex + 1);
	const chunks: RecodeShioriReviewChunk[] = [];
	let entries: SessionEntry[] = [];
	let transcriptParts: string[] = [];
	let length = 0;

	const flush = () => {
		if (entries.length === 0) return;
		chunks.push({ entries, transcript: transcriptParts.join("\n\n") });
		entries = [];
		transcriptParts = [];
		length = 0;
	};

	for (const entry of pending) {
		const rendered = renderEntry(entry)!;
		if (entries.length > 0 && length + rendered.length + 2 > SHIORI_CHUNK_CHARACTERS) flush();
		entries.push(entry);
		transcriptParts.push(rendered.slice(0, SHIORI_CHUNK_CHARACTERS));
		length += rendered.length + 2;
	}
	flush();

	const maxChunks = options.maxChunks ?? SHIORI_MAX_CHUNKS_PER_RUN;
	return {
		chunks: chunks.slice(0, maxChunks),
		pendingEntries: pending.length,
		lastPendingEntryId: pending.at(-1)?.id,
		hasMore: chunks.length > maxChunks,
	};
}

function normalizeTags(value: unknown, kind: RecodeShioriMemoryCandidate["kind"]): string[] {
	const source = Array.isArray(value) ? value : [];
	const tags = source
		.filter((tag): tag is string => typeof tag === "string")
		.map((tag) =>
			tag
				.toLowerCase()
				.replace(/[^a-z0-9_-]+/g, "-")
				.replace(/^-+|-+$/g, ""),
		)
		.filter(Boolean);
	return [...new Set([kind, ...tags])].slice(0, 6);
}

export function parseRecodeShioriCandidates(output: string): RecodeShioriMemoryCandidate[] {
	let parsed: Record<string, unknown> | undefined;
	for (let start = output.indexOf("{"); start >= 0; start = output.indexOf("{", start + 1)) {
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let index = start; index < output.length; index++) {
			const character = output[index]!;
			if (inString) {
				if (escaped) escaped = false;
				else if (character === "\\") escaped = true;
				else if (character === '"') inString = false;
				continue;
			}
			if (character === '"') {
				inString = true;
				continue;
			}
			if (character === "{") depth += 1;
			else if (character === "}") depth -= 1;
			if (depth !== 0) continue;
			try {
				const candidate: unknown = JSON.parse(output.slice(start, index + 1));
				if (isRecord(candidate) && Array.isArray(candidate.memories)) parsed = candidate;
			} catch {
				// Keep scanning for the next balanced object; models may prefix JSON-like commentary.
			}
			break;
		}
		if (parsed) break;
	}
	if (!parsed) throw new Error("Shiori returned invalid JSON");
	const memories = parsed.memories;
	if (!Array.isArray(memories)) throw new Error("Shiori response is missing memories[]");
	const allowedKinds = new Set<RecodeShioriMemoryCandidate["kind"]>([
		"correction",
		"decision",
		"fact",
		"lesson",
		"preference",
		"workflow",
	]);
	const candidates: RecodeShioriMemoryCandidate[] = [];
	for (const value of memories.slice(0, SHIORI_MAX_MEMORIES_PER_CHUNK)) {
		if (!isRecord(value) || typeof value.text !== "string") continue;
		const text = value.text.trim().replace(/\s+/g, " ");
		if (text.length < 12 || text.length > 1000) continue;
		const kind = allowedKinds.has(value.kind as RecodeShioriMemoryCandidate["kind"])
			? (value.kind as RecodeShioriMemoryCandidate["kind"])
			: "fact";
		const confidence = typeof value.confidence === "number" ? value.confidence : 0.75;
		if (confidence < 0.6) continue;
		candidates.push({
			text,
			tags: normalizeTags(value.tags, kind),
			scope: value.scope === "global" ? "global" : "project",
			kind,
			confidence: Math.min(1, confidence),
			evidenceEntryIds: Array.isArray(value.evidenceEntryIds)
				? value.evidenceEntryIds.filter((id): id is string => typeof id === "string").slice(0, 8)
				: [],
		});
	}
	const unique = new Map<string, RecodeShioriMemoryCandidate>();
	for (const candidate of candidates) unique.set(normalizeText(candidate.text), candidate);
	return [...unique.values()];
}

function reviewPrompt(transcript: string): string {
	return `Review this bounded Recode session transcript.

Output exactly:
{"memories":[{"text":"concise durable statement","tags":["searchable-tag"],"scope":"project|global","kind":"preference|decision|workflow|correction|fact|lesson","confidence":0.0,"evidenceEntryIds":["entry-id"]}]}

Use project scope for codebase-specific knowledge. Use global only for stable user preferences or cross-project working habits. Return {"memories":[]} when nothing deserves durable memory.
Return at most 5 memories. Keep each text under 240 characters, use at most 4 tags, and cite at most 3 evidence entry IDs.

TRANSCRIPT
${transcript}`;
}

function fileReviewPrompt(sourcePath: string, content: string): string {
	return `Review this user-selected memory file from ${sourcePath}.

Output exactly:
{"memories":[{"text":"concise durable statement","tags":["searchable-tag"],"scope":"project|global","kind":"preference|decision|workflow|correction|fact|lesson","confidence":0.0,"evidenceEntryIds":[]}]}

Use project scope for codebase-specific knowledge. Use global only for stable user preferences or cross-project working habits. Return {"memories":[]} when nothing deserves durable memory.
Return at most 5 memories. Keep each text under 240 characters and use at most 4 tags.

FILE
${content}`;
}

async function runRecodeShioriCandidates(
	options: Parameters<typeof runRecodeShioriHarness>[0],
): Promise<RecodeShioriMemoryCandidate[]> {
	const output = await runRecodeShioriHarness(options);

	try {
		return parseRecodeShioriCandidates(output);
	} catch (error) {
		if (!(error instanceof Error) || error.message !== "Shiori returned invalid JSON") {
			throw error;
		}
	}

	const repairedOutput = await runRecodeShioriHarness({
		...options,
		thinking: false,
		systemPrompt: `${options.systemPrompt}
You are repairing malformed structured output. Return one valid JSON object only.`,
		prompt: `The previous response was invalid JSON.

Return exactly one valid object matching this shape:
{"memories":[{"text":"concise durable statement","tags":["searchable-tag"],"scope":"project|global","kind":"preference|decision|workflow|correction|fact|lesson","confidence":0.0,"evidenceEntryIds":["entry-id"]}]}

Do not add Markdown or explanations. Preserve only valid memories from the previous response.

INVALID RESPONSE
${output}`,
	});

	return parseRecodeShioriCandidates(repairedOutput);
}

async function chooseRouting(
	routing: RecodeShioriRouting,
	candidate: RecodeShioriMemoryCandidate,
	globalAccess: boolean,
	chooseScope?: (
		candidate: RecodeShioriMemoryCandidate,
		globalAccess: boolean,
	) => Promise<RecodeMemoryScope | undefined>,
): Promise<{ scope?: RecodeMemoryScope; cancelled: boolean }> {
	if (routing === "project") return { scope: "project", cancelled: false };
	if (routing === "global") return { scope: globalAccess ? "global" : "project", cancelled: false };
	if (routing === "auto") {
		return {
			scope: candidate.scope === "global" && globalAccess ? "global" : "project",
			cancelled: false,
		};
	}
	if (!chooseScope) return { scope: "project", cancelled: false };
	return { scope: await chooseScope(candidate, globalAccess), cancelled: false };
}

export async function executeRecodeShioriFileReview(options: {
	cwd: string;
	sourcePath: string;
	content: string;
	modelRegistry: ModelRegistry;
	projectTrusted: boolean;
	config: RecodeMemoryConfig;
	manager: RecodeMemoryManager;
	model: Model<any>;
	chooseScope?: (
		candidate: RecodeShioriMemoryCandidate,
		globalAccess: boolean,
	) => Promise<RecodeMemoryScope | undefined>;
}): Promise<RecodeShioriFileReviewResult> {
	const { config, manager, model } = options;
	if (!config.enabled) throw new Error("Kioku memory is disabled. Enable it from /memory");
	if (!options.projectTrusted) throw new Error("Shiori is unavailable until this project is trusted");
	const content = options.content.trim();
	if (!content) throw new Error("The selected file is empty");

	const chunks: string[] = [];
	for (
		let offset = 0;
		offset < content.length && chunks.length < SHIORI_MAX_CHUNKS_PER_RUN;
		offset += SHIORI_CHUNK_CHARACTERS
	) {
		chunks.push(content.slice(offset, offset + SHIORI_CHUNK_CHARACTERS));
	}
	const startedAt = new Date();
	const seenCandidates = new Set<string>();
	const pendingWrites: RecodeShioriMemoryCandidate[] = [];
	let skippedDuplicates = 0;
	for (const chunk of chunks) {
		const candidates = await runRecodeShioriCandidates({
			cwd: options.cwd,
			model,
			modelRegistry: options.modelRegistry,
			thinking: config.shioriThinking,
			systemPrompt: buildRecodeShioriSystemPrompt(startedAt),
			prompt: fileReviewPrompt(options.sourcePath, chunk),
		});
		for (const candidate of candidates) {
			const candidateKey = normalizeText(candidate.text);
			if (seenCandidates.has(candidateKey)) {
				skippedDuplicates += 1;
				continue;
			}
			seenCandidates.add(candidateKey);
			const route = await chooseRouting(config.cardinalRouting, candidate, config.globalAccess, options.chooseScope);
			if (!route.scope) continue;
			const routed = { ...candidate, scope: route.scope };
			const admission = await admitRecodeCardinalMemory({
				manager,
				candidate: routed,
				globalAccess: config.globalAccess,
				includeProject: true,
				reconcile: false,
			});
			if (admission.status === "duplicate") {
				skippedDuplicates += 1;
				continue;
			}
			pendingWrites.push(routed);
		}
	}

	let savedGlobal = 0;
	let savedProject = 0;
	for (const candidate of pendingWrites) {
		if (candidate.scope === "global") savedGlobal += 1;
		else savedProject += 1;
	}
	if (pendingWrites.length > 0) await manager.sync(true);
	return {
		reviewedCharacters: chunks.reduce((total, chunk) => total + chunk.length, 0),
		saved: pendingWrites.length,
		savedGlobal,
		savedProject,
		skippedDuplicates,
	};
}

export async function executeRecodeShiori(options: {
	cwd: string;
	sessionManager: SessionManager;
	modelRegistry: ModelRegistry;
	projectTrusted: boolean;
	config: RecodeMemoryConfig;
	manager: RecodeMemoryManager;
	model: Model<any>;
	chooseScope?: (
		candidate: RecodeShioriMemoryCandidate,
		globalAccess: boolean,
	) => Promise<RecodeMemoryScope | undefined>;
	onProgress?: (event: RecodeShioriProgressEvent) => void;
	appendMessage?: (message: string) => void;
	maxChunks?: number;
	throughEntryId?: string;
	reviewedEntriesBefore?: number;
	totalEntries?: number;
	greetingText?: string;
	reportStart?: boolean;
	appendMessages?: boolean;
}): Promise<RecodeShioriRunResult | undefined> {
	const { config, manager, model, onProgress, sessionManager } = options;
	if (!config.enabled) throw new Error("Kioku memory is disabled. Enable it from /memory");
	if (!options.projectTrusted) throw new Error("Shiori is unavailable until this project is trusted");

	const branch = sessionManager.getBranch();
	const review = buildRecodeShioriReviewChunks(branch, {
		maxChunks: options.maxChunks,
		throughEntryId: options.throughEntryId,
	});
	if (review.chunks.length === 0) return undefined;

	const startedAt = new Date();
	const reviewedEntriesBefore = options.reviewedEntriesBefore ?? 0;
	const totalEntries = options.totalEntries ?? review.pendingEntries;
	const showProgress = options.totalEntries !== undefined || options.reviewedEntriesBefore !== undefined;
	const greetingText = options.greetingText ?? getRecodeShioriGreeting(startedAt);
	const greeting = showProgress
		? `${greetingText} (${reviewedEntriesBefore}/${totalEntries} entries)`
		: `${greetingText} (${review.pendingEntries} entries)`;
	if (options.reportStart !== false) {
		onProgress?.({
			type: "start",
			message: greeting,
			...(showProgress ? { reviewedEntries: reviewedEntriesBefore, totalEntries } : {}),
		});
	}
	let saved = 0;
	let savedGlobal = 0;
	let savedProject = 0;
	let skippedDuplicates = 0;
	let reviewedEntries = 0;
	let lastReviewedEntryId = review.chunks[0]!.entries.at(-1)!.id;
	const seenCandidates = new Set<string>();
	const pendingWrites: RecodeShioriMemoryCandidate[] = [];
	for (const chunk of review.chunks) {
		const candidates = await runRecodeShioriCandidates({
			cwd: options.cwd,
			model,
			modelRegistry: options.modelRegistry,
			thinking: config.shioriThinking,
			systemPrompt: buildRecodeShioriSystemPrompt(startedAt),
			prompt: reviewPrompt(chunk.transcript),
		});
		for (const candidate of candidates) {
			const candidateKey = normalizeText(candidate.text);
			if (seenCandidates.has(candidateKey)) {
				skippedDuplicates += 1;
				continue;
			}
			seenCandidates.add(candidateKey);
			const route = await chooseRouting(config.cardinalRouting, candidate, config.globalAccess, options.chooseScope);
			if (route.cancelled) throw new Error("Cardinal routing cancelled");
			if (!route.scope) continue;
			const routed = { ...candidate, scope: route.scope };
			const admission = await admitRecodeCardinalMemory({
				manager,
				candidate: routed,
				globalAccess: config.globalAccess,
				includeProject: true,
				reconcile: false,
			});
			if (admission.status === "duplicate") {
				skippedDuplicates += 1;
				continue;
			}
			pendingWrites.push(routed);
		}
		reviewedEntries += chunk.entries.length;
		lastReviewedEntryId = chunk.entries.at(-1)!.id;
		if (showProgress) {
			onProgress?.({
				type: "progress",
				message: `${greetingText} (${reviewedEntriesBefore + reviewedEntries}/${totalEntries} entries)`,
				reviewedEntries: reviewedEntriesBefore + reviewedEntries,
				totalEntries,
			});
		}
	}
	for (const candidate of pendingWrites) {
		saved += 1;
		if (candidate.scope === "global") savedGlobal += 1;
		else savedProject += 1;
	}
	if (saved > 0) await manager.sync(true);
	sessionManager.appendCustomEntry(RECODE_SHIORI_CHECKPOINT, {
		lastReviewedEntryId,
		reviewedAt: new Date().toISOString(),
		saved,
	} satisfies RecodeShioriCheckpoint);
	const savedSummary = saved === 0 ? "No new memories" : `Saved ${saved} ${saved === 1 ? "memory" : "memories"}`;
	const completion = [
		savedSummary,
		savedProject > 0 ? `${savedProject} project` : undefined,
		savedGlobal > 0 ? `${savedGlobal} global` : undefined,
		`${reviewedEntries} reviewed`,
		skippedDuplicates > 0
			? `${skippedDuplicates} ${skippedDuplicates === 1 ? "duplicate" : "duplicates"} skipped`
			: undefined,
		review.hasMore ? "more entries remain" : undefined,
	]
		.filter((part): part is string => part !== undefined)
		.join(" · ");
	const appendMessage =
		options.appendMessage ?? ((message: string) => appendRecodeShioriMessage(sessionManager, message));
	if (options.appendMessages !== false) {
		appendMessage(greeting);
		appendMessage(completion);
	}
	onProgress?.({ type: "complete", message: completion });
	return {
		reviewedEntries,
		saved,
		savedGlobal,
		savedProject,
		skippedDuplicates,
		hasMore: review.hasMore,
		lastReviewedEntryId,
	};
}
