import type { AgentTool } from "@reitaard/recode-agent-core";
import { Type } from "typebox";
import { spawnProcessSync } from "../../../utils/child-process.ts";

const READ_ONLY_GIT_COMMANDS = new Set([
	"branch",
	"cat-file",
	"describe",
	"diff",
	"grep",
	"log",
	"ls-tree",
	"merge-base",
	"rev-list",
	"rev-parse",
	"show",
	"show-ref",
	"status",
	"tag",
]);
const BLOCKED_ARGUMENTS = new Set([
	"-C",
	"-c",
	"--config-env",
	"--exec",
	"--ext-diff",
	"--git-dir",
	"--output",
	"--paginate",
	"--textconv",
	"--upload-pack",
	"--work-tree",
]);
const DEFAULT_MAX_CHARACTERS = 32_000;
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;

const gitReadSchema = Type.Object({
	args: Type.Array(Type.String(), {
		description: 'Git subcommand followed by arguments, for example: ["diff", "--stat", "HEAD~1"]',
		minItems: 1,
		maxItems: 64,
	}),
	maxCharacters: Type.Optional(
		Type.Integer({ description: "Maximum returned characters", minimum: 1, maximum: 100_000 }),
	),
});

function validateArguments(args: string[]): void {
	const command = args[0];
	if (!command || !READ_ONLY_GIT_COMMANDS.has(command)) {
		throw new Error(`Unsupported read-only Git subcommand: ${command || "missing"}`);
	}
	for (const arg of args.slice(1)) {
		const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
		if (BLOCKED_ARGUMENTS.has(name)) throw new Error(`Blocked Git argument for delegated worker: ${name}`);
		if (arg.includes("..\\") || arg.startsWith("../") || arg.includes("/../")) {
			throw new Error("Delegated Git paths may not traverse outside the workspace");
		}
	}
}

export function createWorkerGitReadTool(cwd: string): AgentTool<typeof gitReadSchema, { exitCode: number }> {
	return {
		name: "git_read",
		label: "git_read",
		description:
			"Run one bounded read-only Git query in the active worker workspace. Mutation commands and unsafe execution/configuration flags are refused.",
		parameters: gitReadSchema,
		executionMode: "parallel",
		async execute(_toolCallId, input) {
			validateArguments(input.args);
			const args = ["-c", "core.pager=cat", "-c", "diff.external=", "--no-pager", ...input.args];
			if (input.args[0] === "diff") args.splice(6, 0, "--no-ext-diff");
			const result = spawnProcessSync("git", args, {
				cwd,
				encoding: "utf8",
				maxBuffer: MAX_CAPTURE_BYTES,
				stdio: ["ignore", "pipe", "pipe"],
			});
			const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
			const maxCharacters = input.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
			const text =
				combined.length > maxCharacters
					? `${combined.slice(0, maxCharacters)}\n...[git output truncated]`
					: combined;
			return {
				content: [{ type: "text", text: text || `[git ${input.args[0]} returned no output]` }],
				details: { exitCode: result.status ?? 1 },
			};
		},
	};
}
