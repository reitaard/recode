import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { RecodeGatewayInboundMessage, RecodeGatewaySessionStore } from "./recode-gateway.ts";
import { openRecodeDatabase, type RecodeSqliteDatabase } from "./recode-sqlite.ts";

export type RecodeGatewayJobStatus = "accepted" | "running" | "completed" | "failed" | "interrupted";

export interface RecodeGatewayJob {
	id: string;
	message: RecodeGatewayInboundMessage;
	status: RecodeGatewayJobStatus;
	createdAt: number;
	updatedAt: number;
}

function text(value: unknown): string {
	return typeof value === "string" ? value : String(value ?? "");
}

function number(value: unknown): number {
	return typeof value === "number" ? value : Number(value ?? 0);
}

function rowToJob(row: Record<string, unknown>): RecodeGatewayJob {
	return {
		id: text(row.id),
		message: {
			channel: text(row.channel),
			conversationId: text(row.conversation_id),
			messageId: text(row.message_id),
			text: text(row.text),
		},
		status: text(row.status) as RecodeGatewayJobStatus,
		createdAt: number(row.created_at),
		updatedAt: number(row.updated_at),
	};
}

export class RecodeGatewayStore implements RecodeGatewaySessionStore {
	readonly databasePath: string;
	private database: RecodeSqliteDatabase | undefined;

	constructor(databasePath: string) {
		this.databasePath = databasePath;
	}

	open(): void {
		if (this.database) return;
		mkdirSync(dirname(this.databasePath), { recursive: true, mode: 0o700 });
		const database = openRecodeDatabase(this.databasePath);
		database.exec(`
			PRAGMA journal_mode = WAL;
			PRAGMA synchronous = NORMAL;
			PRAGMA busy_timeout = 5000;
			CREATE TABLE IF NOT EXISTS recode_gateway_routes (
				route TEXT PRIMARY KEY,
				session_id TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS recode_gateway_topic_connections (
				route TEXT PRIMARY KEY,
				connected_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS recode_gateway_jobs (
				id TEXT PRIMARY KEY,
				channel TEXT NOT NULL,
				conversation_id TEXT NOT NULL,
				message_id TEXT NOT NULL,
				text TEXT NOT NULL,
				status TEXT NOT NULL,
				error TEXT,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				UNIQUE(channel, conversation_id, message_id)
			);
			CREATE INDEX IF NOT EXISTS recode_gateway_jobs_status
			ON recode_gateway_jobs(status, created_at);
		`);
		this.database = database;
	}

	close(): void {
		if (!this.database) return;
		this.database.exec("PRAGMA wal_checkpoint(PASSIVE);");
		this.database.close();
		this.database = undefined;
	}

	getSessionId(route: string): string | undefined {
		const row = this.db().prepare("SELECT session_id FROM recode_gateway_routes WHERE route = ?").get(route);
		return row ? text(row.session_id) : undefined;
	}

	setSessionId(route: string, sessionId: string): void {
		this.db()
			.prepare(`
				INSERT INTO recode_gateway_routes (route, session_id, updated_at)
				VALUES (?, ?, ?)
				ON CONFLICT(route) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at
			`)
			.run(route, sessionId, Date.now());
	}

	isTopicConnected(route: string): boolean {
		return !!this.db().prepare("SELECT 1 FROM recode_gateway_topic_connections WHERE route = ?").get(route);
	}

	connectTopic(route: string): void {
		const now = Date.now();
		this.db()
			.prepare(`
				INSERT INTO recode_gateway_topic_connections (route, connected_at, updated_at)
				VALUES (?, ?, ?)
				ON CONFLICT(route) DO UPDATE SET updated_at = excluded.updated_at
			`)
			.run(route, now, now);
	}

	disconnectTopic(route: string): void {
		this.db().prepare("DELETE FROM recode_gateway_topic_connections WHERE route = ?").run(route);
	}

	accept(message: RecodeGatewayInboundMessage): RecodeGatewayJob | undefined {
		const now = Date.now();
		const id = `${message.channel}:${message.conversationId}:${message.messageId}`;
		this.db()
			.prepare(`
				INSERT OR IGNORE INTO recode_gateway_jobs
				(id, channel, conversation_id, message_id, text, status, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?)
			`)
			.run(id, message.channel, message.conversationId, message.messageId, message.text, now, now);
		const inserted = this.db().prepare("SELECT changes() AS count").get();
		if (number(inserted?.count) !== 1) return undefined;
		const row = this.db().prepare("SELECT * FROM recode_gateway_jobs WHERE id = ?").get(id);
		if (!row) return undefined;
		return rowToJob(row);
	}

	recoverAccepted(): RecodeGatewayJob[] {
		const now = Date.now();
		this.db()
			.prepare("UPDATE recode_gateway_jobs SET status = 'interrupted', updated_at = ? WHERE status = 'running'")
			.run(now);
		return this.db()
			.prepare("SELECT * FROM recode_gateway_jobs WHERE status = 'accepted' ORDER BY created_at, id")
			.all()
			.map(rowToJob);
	}

	setJobStatus(id: string, status: RecodeGatewayJobStatus, error?: string): void {
		this.db()
			.prepare("UPDATE recode_gateway_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?")
			.run(status, error ?? null, Date.now(), id);
	}

	counts(): Record<RecodeGatewayJobStatus, number> {
		const counts: Record<RecodeGatewayJobStatus, number> = {
			accepted: 0,
			running: 0,
			completed: 0,
			failed: 0,
			interrupted: 0,
		};
		for (const row of this.db()
			.prepare("SELECT status, COUNT(*) AS count FROM recode_gateway_jobs GROUP BY status")
			.all()) {
			const status = text(row.status) as RecodeGatewayJobStatus;
			if (status in counts) counts[status] = number(row.count);
		}
		return counts;
	}

	private db(): RecodeSqliteDatabase {
		if (!this.database) throw new Error("Recode Gateway database is not open");
		return this.database;
	}
}
