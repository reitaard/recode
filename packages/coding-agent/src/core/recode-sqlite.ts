import { createRequire } from "node:module";

export interface RecodeSqliteStatement {
	all(...params: unknown[]): Record<string, unknown>[];
	get(...params: unknown[]): Record<string, unknown> | undefined;
	run(...params: unknown[]): unknown;
}

export interface RecodeSqliteDatabase {
	exec(sql: string): void;
	prepare(sql: string): RecodeSqliteStatement;
	close(): void;
}

interface RecodeSqliteConstructor {
	new (path: string): RecodeSqliteDatabase;
}

interface RecodeSqliteModule {
	Database?: RecodeSqliteConstructor;
	DatabaseSync?: RecodeSqliteConstructor;
}

const require = createRequire(import.meta.url);

export function openRecodeDatabase(path: string): RecodeSqliteDatabase {
	const moduleName = process.versions.bun ? "bun:sqlite" : "node:sqlite";
	const sqlite = require(moduleName) as RecodeSqliteModule;
	const Database = sqlite.DatabaseSync ?? sqlite.Database;
	if (!Database) throw new Error(`SQLite is unavailable from ${moduleName}`);
	return new Database(path);
}
