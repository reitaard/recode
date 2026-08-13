import type { RecodeMemoryManager } from "./recode-memory-manager.ts";
import type { RecodeMemoryScope } from "./recode-memory-types.ts";

export interface RecodeCardinalMemoryCandidate {
	text: string;
	tags: string[];
	scope: RecodeMemoryScope;
}

export interface RecodeCardinalAdmissionResult {
	status: "saved" | "duplicate";
	scope: RecodeMemoryScope;
	path?: string;
}

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.replace(/#[\w-]+|\[\[[^\]]+\]\]/g, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

/**
 * Cardinal is the single deterministic admission boundary for agent-originated
 * Kioku writes. It validates access, rejects duplicates, and delegates the
 * filesystem write and reconciliation to RecodeMemoryManager.
 */
export async function admitRecodeCardinalMemory(options: {
	manager: RecodeMemoryManager;
	candidate: RecodeCardinalMemoryCandidate;
	globalAccess: boolean;
	daily?: boolean;
	includeProject?: boolean;
	reconcile?: boolean;
}): Promise<RecodeCardinalAdmissionResult> {
	const candidate = {
		...options.candidate,
		text: options.candidate.text.trim().replace(/\s+/g, " "),
	};
	if (!candidate.text) throw new Error("Memory text cannot be empty");
	if (candidate.scope === "global" && !options.globalAccess) {
		throw new Error("Global memory access is disabled");
	}
	const normalized = normalizeText(candidate.text);
	const results = await options.manager.search(candidate.text, 6, candidate.scope);
	if (results.some((result) => normalizeText(result.text).includes(normalized))) {
		return { status: "duplicate", scope: candidate.scope };
	}
	const path = await options.manager.write(
		candidate.scope,
		candidate.text,
		options.daily,
		options.includeProject,
		candidate.tags,
		options.reconcile,
	);
	return { status: "saved", scope: candidate.scope, path };
}
