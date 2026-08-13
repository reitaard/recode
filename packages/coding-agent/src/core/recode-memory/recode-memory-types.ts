export type RecodeMemoryScope = "global" | "project";
export type RecodeMemoryScopeSelection = RecodeMemoryScope | "both";
export type RecodeShioriRouting = "ask" | "auto" | "global" | "project";

export interface RecodeShioriModelPreference {
	provider: string;
	id: string;
}

export interface RecodeMemoryConfig {
	enabled: boolean;
	scope: RecodeMemoryScopeSelection;
	autoRecall: boolean;
	globalAccess: boolean;
	globalAutoRecall: boolean;
	cardinalRouting: RecodeShioriRouting;
	shioriModel?: RecodeShioriModelPreference;
	shioriThinking: boolean;
	maxResults: number;
	maxInjectedCharacters: number;
}

export interface RecodeMemoryDocument {
	id: string;
	scope: RecodeMemoryScope;
	path: string;
	hash: string;
	mtimeMs: number;
}

export interface RecodeMemoryChunk {
	id: string;
	documentId: string;
	scope: RecodeMemoryScope;
	path: string;
	lineStart: number;
	lineEnd: number;
	text: string;
	tokenCount: number;
}

export interface RecodeMemorySearchResult extends RecodeMemoryChunk {
	score: number;
	updatedAt: number;
}

export interface RecodeMemoryStatus {
	enabled: boolean;
	scope: RecodeMemoryScopeSelection;
	documents: number;
	chunks: number;
	databasePath: string;
	globalRoot: string;
	projectRoot: string;
}
