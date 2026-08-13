import type { AssistantMessage } from "@reitaard/recode-ai";
import type { AgentEvent } from "../types.ts";
import type { Session } from "./session/session.ts";
import { uuidv7 } from "./session/uuid.ts";
import type { SessionTreeEntry } from "./types.ts";
import { AgentHarnessError, toError } from "./types.ts";

export const RECODE_HARNESS_JOURNAL_CUSTOM_TYPE = "recode.agent_harness.journal";

export type RecodeHarnessOperation =
	| "prompt"
	| "message"
	| "retry"
	| "skill"
	| "prompt_template"
	| "compaction"
	| "branch_summary";

export type RecodeHarnessOperationOutcome = "success" | "error" | "aborted" | "cancelled";

export interface RecodeHarnessJournalError {
	name: string;
	message: string;
	code?: string;
}

interface RecodeHarnessJournalRecordBase {
	version: 1;
	event:
		| "operation_started"
		| "operation_finished"
		| "operation_interrupted"
		| "turn_started"
		| "turn_finished"
		| "turn_interrupted"
		| "tool_started"
		| "tool_finished"
		| "tool_interrupted";
	operationId: string;
}

export type RecodeHarnessJournalRecord =
	| (RecodeHarnessJournalRecordBase & {
			event: "operation_started";
			operation: RecodeHarnessOperation;
	  })
	| (RecodeHarnessJournalRecordBase & {
			event: "operation_finished";
			operation: RecodeHarnessOperation;
			outcome: RecodeHarnessOperationOutcome;
			error?: RecodeHarnessJournalError;
	  })
	| (RecodeHarnessJournalRecordBase & {
			event: "operation_interrupted";
			operation: RecodeHarnessOperation;
			reason: "process_restart" | "operation_failed";
			error?: RecodeHarnessJournalError;
	  })
	| (RecodeHarnessJournalRecordBase & {
			event: "turn_started";
			turnId: string;
	  })
	| (RecodeHarnessJournalRecordBase & {
			event: "turn_finished";
			turnId: string;
			outcome: RecodeHarnessOperationOutcome;
	  })
	| (RecodeHarnessJournalRecordBase & {
			event: "turn_interrupted";
			turnId: string;
			reason: "process_restart" | "operation_failed";
	  })
	| (RecodeHarnessJournalRecordBase & {
			event: "tool_started";
			turnId: string;
			toolCallId: string;
			toolName: string;
	  })
	| (RecodeHarnessJournalRecordBase & {
			event: "tool_finished";
			turnId: string;
			toolCallId: string;
			toolName: string;
			isError: boolean;
	  })
	| (RecodeHarnessJournalRecordBase & {
			event: "tool_interrupted";
			turnId: string;
			toolCallId: string;
			toolName: string;
			reason: "process_restart" | "operation_failed";
	  });

export interface RecodeHarnessJournalEntry {
	entryId: string;
	timestamp: string;
	record: RecodeHarnessJournalRecord;
}

export interface RecodeHarnessRecoveryResult {
	operationsInterrupted: number;
	turnsInterrupted: number;
	toolsInterrupted: number;
}

interface ActiveOperation {
	id: string;
	operation: RecodeHarnessOperation;
}

interface ActiveTool {
	turnId: string;
	toolCallId: string;
	toolName: string;
}

function serializeError(error: unknown): RecodeHarnessJournalError {
	const cause = toError(error);
	const code = "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
	return { name: cause.name, message: cause.message, code };
}

function isJournalRecord(value: unknown): value is RecodeHarnessJournalRecord {
	if (typeof value !== "object" || value === null) return false;
	const record = value as { version?: unknown; event?: unknown; operationId?: unknown };
	return record.version === 1 && typeof record.event === "string" && typeof record.operationId === "string";
}

function toJournalEntry(entry: SessionTreeEntry): RecodeHarnessJournalEntry | undefined {
	if (entry.type !== "custom" || entry.customType !== RECODE_HARNESS_JOURNAL_CUSTOM_TYPE) return undefined;
	if (!isJournalRecord(entry.data)) return undefined;
	return { entryId: entry.id, timestamp: entry.timestamp, record: entry.data };
}

function outcomeFromMessage(message: AssistantMessage): RecodeHarnessOperationOutcome {
	if (message.stopReason === "error") return "error";
	if (message.stopReason === "aborted") return "aborted";
	return "success";
}

/** Durable, model-invisible operation journal used by AgentHarness and future inspectors. */
export class RecodeHarnessJournal {
	private readonly session: Session;
	private recoveryPromise?: Promise<RecodeHarnessRecoveryResult>;
	private activeOperation?: ActiveOperation;
	private activeTurnId?: string;
	private activeTools = new Map<string, ActiveTool>();

	constructor(session: Session) {
		this.session = session;
	}

	async getEntries(): Promise<RecodeHarnessJournalEntry[]> {
		return (await this.session.getEntries()).flatMap((entry) => {
			const journalEntry = toJournalEntry(entry);
			return journalEntry ? [journalEntry] : [];
		});
	}

	async recover(): Promise<RecodeHarnessRecoveryResult> {
		this.recoveryPromise ??= this.recoverUnfinishedWork();
		return this.recoveryPromise;
	}

	async beginOperation(operation: RecodeHarnessOperation): Promise<void> {
		await this.recover();
		if (this.activeOperation) {
			throw new AgentHarnessError("invalid_state", `Operation ${this.activeOperation.id} is already active`);
		}
		this.activeOperation = { id: uuidv7(), operation };
		await this.append({
			version: 1,
			event: "operation_started",
			operationId: this.activeOperation.id,
			operation,
		});
	}

	async finishOperation(outcome: RecodeHarnessOperationOutcome, error?: unknown): Promise<void> {
		const operation = this.requireActiveOperation();
		await this.finishOpenChildren("operation_failed");
		await this.append({
			version: 1,
			event: "operation_finished",
			operationId: operation.id,
			operation: operation.operation,
			outcome,
			error: error === undefined ? undefined : serializeError(error),
		});
		this.activeOperation = undefined;
	}

	async interruptOperation(error: unknown): Promise<void> {
		const operation = this.requireActiveOperation();
		await this.finishOpenChildren("operation_failed");
		await this.append({
			version: 1,
			event: "operation_interrupted",
			operationId: operation.id,
			operation: operation.operation,
			reason: "operation_failed",
			error: serializeError(error),
		});
		this.activeOperation = undefined;
	}

	async recordAgentEvent(event: AgentEvent): Promise<void> {
		const operation = this.activeOperation;
		if (!operation) return;
		if (event.type === "turn_start") {
			this.activeTurnId = uuidv7();
			await this.append({
				version: 1,
				event: "turn_started",
				operationId: operation.id,
				turnId: this.activeTurnId,
			});
			return;
		}
		if (event.type === "turn_end" && this.activeTurnId) {
			await this.append({
				version: 1,
				event: "turn_finished",
				operationId: operation.id,
				turnId: this.activeTurnId,
				outcome: event.message.role === "assistant" ? outcomeFromMessage(event.message) : "success",
			});
			this.activeTurnId = undefined;
			return;
		}
		if (event.type === "tool_execution_start" && this.activeTurnId) {
			const tool = {
				turnId: this.activeTurnId,
				toolCallId: event.toolCallId,
				toolName: event.toolName,
			};
			this.activeTools.set(event.toolCallId, tool);
			await this.append({
				version: 1,
				event: "tool_started",
				operationId: operation.id,
				...tool,
			});
			return;
		}
		if (event.type === "tool_execution_end") {
			const tool = this.activeTools.get(event.toolCallId);
			if (!tool) return;
			await this.append({
				version: 1,
				event: "tool_finished",
				operationId: operation.id,
				...tool,
				isError: event.isError,
			});
			this.activeTools.delete(event.toolCallId);
		}
	}

	private requireActiveOperation(): ActiveOperation {
		if (!this.activeOperation) throw new AgentHarnessError("invalid_state", "No journal operation is active");
		return this.activeOperation;
	}

	private async append(record: RecodeHarnessJournalRecord): Promise<void> {
		await this.session.appendCustomEntry(RECODE_HARNESS_JOURNAL_CUSTOM_TYPE, record);
	}

	private async finishOpenChildren(reason: "process_restart" | "operation_failed"): Promise<void> {
		const operation = this.requireActiveOperation();
		for (const tool of this.activeTools.values()) {
			await this.append({
				version: 1,
				event: "tool_interrupted",
				operationId: operation.id,
				...tool,
				reason,
			});
		}
		this.activeTools.clear();
		if (!this.activeTurnId) return;
		await this.append({
			version: 1,
			event: "turn_interrupted",
			operationId: operation.id,
			turnId: this.activeTurnId,
			reason,
		});
		this.activeTurnId = undefined;
	}

	private async recoverUnfinishedWork(): Promise<RecodeHarnessRecoveryResult> {
		const entries = await this.getEntries();
		const operations = new Map<string, RecodeHarnessOperation>();
		const turns = new Map<string, { operationId: string; turnId: string }>();
		const tools = new Map<string, ActiveTool & { operationId: string }>();
		for (const { record } of entries) {
			if (record.event === "operation_started") operations.set(record.operationId, record.operation);
			if (record.event === "operation_finished" || record.event === "operation_interrupted") {
				operations.delete(record.operationId);
			}
			if (record.event === "turn_started") {
				turns.set(record.turnId, { operationId: record.operationId, turnId: record.turnId });
			}
			if (record.event === "turn_finished" || record.event === "turn_interrupted") turns.delete(record.turnId);
			if (record.event === "tool_started") tools.set(record.toolCallId, record);
			if (record.event === "tool_finished" || record.event === "tool_interrupted") tools.delete(record.toolCallId);
		}

		for (const tool of tools.values()) {
			await this.append({ ...tool, version: 1, event: "tool_interrupted", reason: "process_restart" });
		}
		for (const turn of turns.values()) {
			await this.append({ version: 1, event: "turn_interrupted", ...turn, reason: "process_restart" });
		}
		for (const [operationId, operation] of operations) {
			await this.append({
				version: 1,
				event: "operation_interrupted",
				operationId,
				operation,
				reason: "process_restart",
			});
		}
		return {
			operationsInterrupted: operations.size,
			turnsInterrupted: turns.size,
			toolsInterrupted: tools.size,
		};
	}
}
