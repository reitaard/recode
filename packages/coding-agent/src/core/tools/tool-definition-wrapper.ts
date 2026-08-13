import type { AgentTool } from "@reitaard/recode-agent-core";
import type { ExtensionContext, ToolDefinition } from "../extensions/types.ts";

function normalizeExtensionToolArguments(toolName: string, args: unknown): unknown {
	if (toolName !== "get_search_content" || typeof args !== "object" || args === null || Array.isArray(args)) {
		return args;
	}

	const normalized = { ...args } as Record<string, unknown>;
	if (normalized.query === "") delete normalized.query;
	if (normalized.url === "") delete normalized.url;
	if (normalized.findText === "" || (Array.isArray(normalized.findText) && normalized.findText.length === 0)) {
		delete normalized.findText;
	}
	if (normalized.findText === undefined) {
		delete normalized.findMode;
	} else {
		delete normalized.offset;
		delete normalized.limit;
	}
	return normalized;
}

/** Wrap a ToolDefinition into an AgentTool for the core runtime. */
export function wrapToolDefinition<TDetails = unknown>(
	definition: ToolDefinition<any, TDetails>,
	ctxFactory?: () => ExtensionContext,
): AgentTool<any, TDetails> {
	const requiresCompatibilityPreparation = definition.name === "get_search_content";
	return {
		name: definition.name,
		label: definition.label,
		description: definition.description,
		parameters: definition.parameters,
		prepareArguments:
			definition.prepareArguments || requiresCompatibilityPreparation
				? (args) => {
						const normalized = normalizeExtensionToolArguments(definition.name, args);
						return definition.prepareArguments ? definition.prepareArguments(normalized) : normalized;
					}
				: undefined,
		executionMode: definition.executionMode,
		execute: (toolCallId, params, signal, onUpdate) =>
			definition.execute(toolCallId, params, signal, onUpdate, ctxFactory?.() as ExtensionContext),
	};
}

/** Wrap multiple ToolDefinitions into AgentTools for the core runtime. */
export function wrapToolDefinitions(
	definitions: ToolDefinition<any, any>[],
	ctxFactory?: () => ExtensionContext,
): AgentTool<any>[] {
	return definitions.map((definition) => wrapToolDefinition(definition, ctxFactory));
}

/**
 * Synthesize a minimal ToolDefinition from an AgentTool.
 *
 * This keeps AgentSession's internal registry definition-first even when a caller
 * provides plain AgentTool overrides that do not include prompt metadata or renderers.
 */
export function createToolDefinitionFromAgentTool(tool: AgentTool<any>): ToolDefinition<any, unknown> {
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		parameters: tool.parameters as any,
		prepareArguments: tool.prepareArguments,
		executionMode: tool.executionMode,
		execute: async (toolCallId, params, signal, onUpdate) => tool.execute(toolCallId, params, signal, onUpdate),
	};
}
