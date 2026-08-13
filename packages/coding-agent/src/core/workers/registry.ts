import type { NamedWorkerDefinition } from "../delegation/named-worker.ts";
import { LEVI_WORKER } from "./levi/definition.ts";
import { MAYURI_WORKER } from "./mayuri/definition.ts";
import { SHIORI_WORKER } from "./shiori/definition.ts";

/**
 * Stable worker ids are protocol/configuration identities. Display names may be
 * changed without breaking prompts, stored jobs, or routing.
 */
export const RECODE_NAMED_WORKERS: readonly NamedWorkerDefinition[] = [MAYURI_WORKER, LEVI_WORKER, SHIORI_WORKER];
