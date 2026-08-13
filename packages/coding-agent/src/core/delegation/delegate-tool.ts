import type { AgentTool } from "@reitaard/recode-agent-core";
import type { Model, Models } from "@reitaard/recode-ai";
import { type Static, Type } from "typebox";
import type { ModelRegistry } from "../model-registry.ts";
import {
	formatNamedWorkerIdentity,
	getNamedWorkerReferences,
	type NamedWorkerDefinition,
	type NamedWorkerProgressEvent,
	type NamedWorkerRunResult,
	type NamedWorkerSkill,
} from "./named-worker.ts";
import { WorkerDirectory } from "./worker-directory.ts";

function createDelegateSchema(workers: readonly NamedWorkerDefinition[]) {
	const workerIds = workers.map((worker) => worker.id);
	const references = workers.flatMap(getNamedWorkerReferences);
	const aliases = workers.map((worker) => `${formatNamedWorkerIdentity(worker)} -> ${worker.id}`).join(", ");
	return Type.Object({
		worker: Type.String({
			description: `Worker id or display name. Prefer canonical ids: ${workerIds.join(", ")}. Aliases: ${aliases}.`,
			enum: references,
		}),
		task: Type.String({ description: "One focused task for the worker" }),
		context: Type.Optional(
			Type.String({ description: "Small parent-supplied context that is necessary to complete the task" }),
		),
		workspace: Type.Optional(
			Type.String({ description: "Active workspace or another worktree of the same Git repository" }),
		),
	});
}

type DelegateSchema = ReturnType<typeof createDelegateSchema>;

export type DelegateToolInput = Static<DelegateSchema>;

export interface DelegateToolDetails {
	result: NamedWorkerRunResult;
}

export interface CreateDelegateToolOptions {
	cwd?: string;
	/** Shared directory for any Aizen/host that should see the same worker registry. */
	directory?: WorkerDirectory;
	/** Fixed model for tests or simple hosts. */
	model?: Model<any>;
	/** Live model resolver for hosts where the parent can switch models. */
	getModel?: () => Model<any> | undefined;
	workers?: readonly NamedWorkerDefinition[];
	skills?: readonly NamedWorkerSkill[];
	getSkills?: () => readonly NamedWorkerSkill[];
	models?: Models;
	modelRegistry?: ModelRegistry;
	/** Optional host policy. Omit for no worker time limit. */
	timeoutMs?: number;
	maxResultCharacters?: number;
	onProgress?: (event: NamedWorkerProgressEvent) => void;
}

function buildWorkerDescription(workers: readonly NamedWorkerDefinition[]): string {
	return workers
		.map((worker) => {
			const skill = worker.skillName ? `; skill=${worker.skillName}` : "";
			const personality = worker.personality ? `; personality=${worker.personality}` : "";
			return `- id=${worker.id}; name=${worker.displayName}; role=${worker.description}${skill}${personality}`;
		})
		.join("\n");
}

function formatProcessHeader(result: NamedWorkerRunResult): string {
	const durationSeconds = (result.durationMs / 1_000).toFixed(result.durationMs < 10_000 ? 1 : 0);
	const identity = formatNamedWorkerIdentity({
		displayName: result.workerName,
		aliases: result.workerAliases,
	});
	return `[worker ${result.workerId}/${identity} | run ${result.runId.slice(0, 8)} | ${result.status} | ${durationSeconds}s]`;
}

function formatToolResult(result: NamedWorkerRunResult): string {
	const header = formatProcessHeader(result);
	switch (result.status) {
		case "completed":
			return `${header}\n${result.output}`;
		case "cancelled":
			return `${header}\n${result.error ?? "Delegated worker was cancelled."}`;
		case "timeout":
			return `${header}\n${result.error ?? "Delegated worker timed out."}`;
		case "failed":
			return `${header}\n${result.error ?? "Delegated worker failed."}`;
	}
}

function resolveDirectory(options: CreateDelegateToolOptions): WorkerDirectory {
	if (options.directory) return options.directory;
	if (!options.cwd) throw new Error("createDelegateTool requires cwd when directory is not supplied");
	if (!options.workers) throw new Error("createDelegateTool requires workers when directory is not supplied");
	return new WorkerDirectory({
		cwd: options.cwd,
		workers: options.workers,
		model: options.model,
		getModel: options.getModel,
		skills: options.skills,
		getSkills: options.getSkills,
		models: options.models,
		modelRegistry: options.modelRegistry,
		timeoutMs: options.timeoutMs,
		maxResultCharacters: options.maxResultCharacters,
		onProgress: options.onProgress,
	});
}

/**
 * Create the parent-facing one-shot delegate tool.
 *
 * Persistent, directly addressable worker conversations are exposed separately
 * through worker_start/worker_message and share the same WorkerDirectory.
 */
export function createDelegateTool(options: CreateDelegateToolOptions): AgentTool<DelegateSchema, DelegateToolDetails> {
	const directory = resolveDirectory(options);
	const definitions = directory.getWorkerDefinitions();
	const availableWorkers = buildWorkerDescription(definitions);
	const parameters = createDelegateSchema(definitions);
	return {
		name: "delegate",
		label: "delegate",
		description: `Run one focused, read-only task with a named worker and return only its bounded final result. The worker argument uses the directory below; prefer canonical ids, while display names remain accepted aliases. Never invent a worker. When the user explicitly requests a worker by id, display name, or role, call delegate even for a simple read/grep/find/ls task. You may launch multiple independent delegate calls in one turn; the provider may queue them. There is no built-in worker timeout unless the host explicitly configures one. If an explicitly requested worker fails or is cancelled, report that result; do not replace the worker by doing its task yourself unless the user explicitly requested fallback.\n\nWorker directory:\n${availableWorkers}`,
		parameters,
		executionMode: "parallel",
		async execute(_toolCallId, input, signal) {
			const result = await directory.runOneShot(
				input.worker,
				input.task,
				input.context,
				signal,
				undefined,
				input.workspace,
			);
			return {
				content: [{ type: "text", text: formatToolResult(result) }],
				details: { result },
			};
		},
	};
}
