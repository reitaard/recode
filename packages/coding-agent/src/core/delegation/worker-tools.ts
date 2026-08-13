import type { AgentTool } from "@reitaard/recode-agent-core";
import { Type } from "typebox";
import { formatNamedWorkerIdentity, getNamedWorkerReferences } from "./named-worker.ts";
import type {
	WorkerConversationSnapshot,
	WorkerConversationTurnResult,
	WorkerDescriptor,
	WorkerDirectory,
} from "./worker-directory.ts";

function workerReferenceSchema(directory: WorkerDirectory) {
	const workers = directory.getWorkerDefinitions();
	const references = workers.flatMap(getNamedWorkerReferences);
	const mapping = workers.map((worker) => `${worker.id}=${formatNamedWorkerIdentity(worker)}`).join(", ");
	return Type.String({
		description: `Worker id or display name. Prefer canonical ids. Available: ${mapping}.`,
		enum: references,
	});
}

function failurePolicy(turn: WorkerConversationTurnResult): string {
	if (turn.result.status === "completed") return "";
	return "\nAUTOMATIC_RETRY_BLOCKED: Report this worker failure and its conversationId. Do not call worker_start or worker_message again for the same task until a new user message explicitly asks to retry.";
}

function formatTurn(turn: WorkerConversationTurnResult): string {
	const { conversation, result } = turn;
	const duration = (result.durationMs / 1_000).toFixed(result.durationMs < 10_000 ? 1 : 0);
	const identity = formatNamedWorkerIdentity({
		displayName: result.workerName,
		aliases: result.workerAliases,
	});
	const header = `[worker ${result.workerId}/${identity} | run ${result.runId.slice(0, 8)} | ${result.status} | ${duration}s]`;
	return `conversationId: ${conversation.conversationId}\n${header}\n${result.output || result.error || `[${result.status}]`}${failurePolicy(turn)}`;
}

function formatStatus(snapshot: WorkerConversationSnapshot): string {
	const elapsed = (snapshot.elapsedMs / 1_000).toFixed(snapshot.elapsedMs < 10_000 ? 1 : 0);
	const tool = snapshot.lastToolName ? ` | tool ${snapshot.lastToolName}` : "";
	const error = snapshot.error ? `\nerror: ${snapshot.error}` : "";
	const output = snapshot.lastOutput
		? `\nlast output: ${snapshot.lastOutput.length > 600 ? `${snapshot.lastOutput.slice(0, 597)}...` : snapshot.lastOutput}`
		: "";
	const identity = formatNamedWorkerIdentity({
		displayName: snapshot.workerName,
		aliases: snapshot.workerAliases,
	});
	return `conversationId: ${snapshot.conversationId}\n[worker ${snapshot.workerId}/${identity} | run ${snapshot.runId?.slice(0, 8) ?? "none"} | ${snapshot.status} | ${elapsed}s | turns ${snapshot.turnCount}${tool}]\ntask: ${snapshot.taskSummary}${error}${output}`;
}

export function createWorkerControlTools(directory: WorkerDirectory): AgentTool<any>[] {
	const listSchema = Type.Object({});
	const startSchema = Type.Object({
		worker: workerReferenceSchema(directory),
		message: Type.String({ description: "First task or message for the worker" }),
		context: Type.Optional(Type.String({ description: "Small Aizen context needed for this conversation" })),
		workspace: Type.Optional(
			Type.String({ description: "Active workspace or another worktree of the same Git repository" }),
		),
	});
	const startManySchema = Type.Object({
		requests: Type.Array(
			Type.Object({
				worker: workerReferenceSchema(directory),
				message: Type.String({ description: "Independent first task or message for this worker conversation" }),
				context: Type.Optional(Type.String({ description: "Small Aizen context for this conversation" })),
				workspace: Type.Optional(
					Type.String({ description: "Active workspace or another worktree of the same Git repository" }),
				),
			}),
			{
				description: "Independent worker conversations to launch concurrently",
				minItems: 2,
				maxItems: 8,
			},
		),
	});
	const messageSchema = Type.Object({
		conversationId: Type.String({ description: "Full worker conversation id returned by worker_start" }),
		message: Type.String({ description: "Next message for the same worker personality and conversation" }),
		context: Type.Optional(Type.String({ description: "Small new Aizen context for this turn" })),
	});
	const statusSchema = Type.Object({
		conversationId: Type.Optional(Type.String({ description: "Specific full conversation id; omit to list all" })),
	});
	const conversationSchema = Type.Object({
		conversationId: Type.String({ description: "Full worker conversation id" }),
	});

	const listTool: AgentTool<typeof listSchema, { workers: WorkerDescriptor[] }> = {
		name: "worker_list",
		label: "worker_list",
		description:
			"List the live worker directory: canonical ids, display names, roles, personality, skill, and tools. Use this when worker identity or capability is uncertain.",
		parameters: listSchema,
		executionMode: "parallel",
		async execute() {
			const workers = directory.listWorkers();
			const lines = workers.map((worker) => {
				const personality = worker.personality ? ` personality=${worker.personality}` : "";
				const skill = worker.skillName ? ` skill=${worker.skillName}` : "";
				return `- id=${worker.id}; name=${formatNamedWorkerIdentity(worker)}; role=${worker.description}; tools=${worker.tools.join(",")}${skill}${personality}`;
			});
			return { content: [{ type: "text", text: lines.join("\n") }], details: { workers } };
		},
	};

	const startTool: AgentTool<typeof startSchema, WorkerConversationTurnResult> = {
		name: "worker_start",
		label: "worker_start",
		description:
			"Open a named worker conversation and send its first message. The result includes a full conversationId that must be reused verbatim with worker_message/status/cancel/close. The conversation preserves bounded dialogue context and may run in parallel with other worker_start calls. Never automatically retry a failed worker or replace it with parent work; wait for a new user message explicitly requesting retry or fallback.",
		parameters: startSchema,
		executionMode: "parallel",
		async execute(_toolCallId, input, signal) {
			const turn = await directory.startConversation(
				input.worker,
				input.message,
				input.context,
				signal,
				undefined,
				input.workspace,
			);
			return {
				content: [{ type: "text", text: formatTurn(turn) }],
				details: turn,
				terminate: turn.result.status !== "completed",
			};
		},
	};

	const startManyTool: AgentTool<typeof startManySchema, { turns: WorkerConversationTurnResult[] }> = {
		name: "worker_start_many",
		label: "worker_start_many",
		description:
			"Launch two to eight independent named-worker conversations concurrently in one deterministic tool call. Requests may use the same worker personality for separate tasks. Each completed result includes its own conversationId for later worker_message/status/cancel/close calls.",
		parameters: startManySchema,
		executionMode: "parallel",
		async execute(_toolCallId, input, signal) {
			const turns = await directory.startConversations(
				input.requests.map((request) => ({
					workerReference: request.worker,
					message: request.message,
					context: request.context,
					signal,
					workspace: request.workspace,
				})),
			);
			return {
				content: [{ type: "text", text: turns.map(formatTurn).join("\n\n") }],
				details: { turns },
				terminate: turns.some((turn) => turn.result.status !== "completed"),
			};
		},
	};

	const messageTool: AgentTool<typeof messageSchema, WorkerConversationTurnResult> = {
		name: "worker_message",
		label: "worker_message",
		description:
			"Continue an existing worker conversation using the full conversationId returned by worker_start. The same named personality receives the previous Aizen/worker dialogue as bounded context. Never automatically retry a failed turn or replace it with parent work; wait for a new user message explicitly requesting retry or fallback.",
		parameters: messageSchema,
		executionMode: "parallel",
		async execute(_toolCallId, input, signal) {
			const turn = await directory.messageConversation(input.conversationId, input.message, input.context, signal);
			return {
				content: [{ type: "text", text: formatTurn(turn) }],
				details: turn,
				terminate: turn.result.status !== "completed",
			};
		},
	};

	const statusTool: AgentTool<typeof statusSchema, { conversations: WorkerConversationSnapshot[] }> = {
		name: "worker_status",
		label: "worker_status",
		description:
			"Show live or recent worker conversation state, including each full conversationId, worker identity, run id, status, elapsed time, turn count, current/last tool, and bounded last result. Hidden reasoning and child tool transcripts are never exposed. Status is observational and must not trigger an automatic retry.",
		parameters: statusSchema,
		executionMode: "parallel",
		async execute(_toolCallId, input) {
			const snapshots = directory.getStatus(input.conversationId);
			const text = snapshots.length > 0 ? snapshots.map(formatStatus).join("\n\n") : "No worker conversations.";
			return { content: [{ type: "text", text }], details: { conversations: snapshots } };
		},
	};

	const cancelTool: AgentTool<typeof conversationSchema, { cancelled: boolean }> = {
		name: "worker_cancel",
		label: "worker_cancel",
		description: "Cancel the currently running turn for one worker conversation without closing the conversation.",
		parameters: conversationSchema,
		executionMode: "parallel",
		async execute(_toolCallId, input) {
			const cancelled = directory.cancelConversation(input.conversationId);
			return {
				content: [
					{
						type: "text",
						text: cancelled
							? `Cancellation requested for worker conversation ${input.conversationId}.`
							: `Worker conversation ${input.conversationId} is not currently running.`,
					},
				],
				details: { cancelled },
			};
		},
	};

	const closeTool: AgentTool<typeof conversationSchema, { conversation: WorkerConversationSnapshot }> = {
		name: "worker_close",
		label: "worker_close",
		description: "Close and forget one worker conversation. Any active turn is cancelled first.",
		parameters: conversationSchema,
		executionMode: "parallel",
		async execute(_toolCallId, input) {
			const snapshot = directory.closeConversation(input.conversationId);
			return {
				content: [{ type: "text", text: `Closed worker conversation ${snapshot.conversationId}.` }],
				details: { conversation: snapshot },
			};
		},
	};

	return [listTool, startTool, startManyTool, messageTool, statusTool, cancelTool, closeTool];
}
