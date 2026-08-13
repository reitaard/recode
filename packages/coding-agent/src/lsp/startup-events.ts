import type { LspServerStatus } from "./types.ts";

export type LspStartupEvent =
	| { type: "server_state"; server: LspServerStatus }
	| { type: "diagnostics"; server: string; count: number };

export type LspStartupListener = (event: LspStartupEvent) => void;
