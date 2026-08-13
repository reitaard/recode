import { openRecodeDatabase, type RecodeSqliteDatabase } from "../recode-sqlite.ts";

export type { RecodeSqliteDatabase, RecodeSqliteStatement } from "../recode-sqlite.ts";

export function openRecodeMemoryDatabase(path: string): RecodeSqliteDatabase {
	return openRecodeDatabase(path);
}
