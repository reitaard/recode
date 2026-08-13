import { Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { DefaultPackageManager } from "../package-manager.ts";
import type { SettingsManager } from "../settings-manager.ts";

const packageManageSchema = Type.Object({
	action: Type.Union([Type.Literal("list"), Type.Literal("install"), Type.Literal("remove")]),
	source: Type.Optional(Type.String({ description: "Pi-compatible npm, git, or local package source" })),
	scope: Type.Optional(Type.Union([Type.Literal("user"), Type.Literal("project")])),
});

export function createPackageManageToolDefinition(options: {
	cwd: string;
	agentDir: string;
	settingsManager: SettingsManager;
}): ToolDefinition<typeof packageManageSchema> {
	const manager = new DefaultPackageManager(options);
	return {
		name: "package_manage",
		label: "package manage",
		description:
			"Manage Recode-compatible Pi packages. Use only when the Creator explicitly asks to list, install, or remove a package.",
		promptSnippet: "Manage explicitly requested Recode packages",
		parameters: packageManageSchema,
		async execute(_toolCallId, input) {
			if (input.action === "list") {
				const packages = manager.listConfiguredPackages();
				const output = packages.length
					? packages.map((pkg) => `${pkg.scope}: ${pkg.source}`).join("\n")
					: "No packages configured.";
				return { content: [{ type: "text", text: output }], details: undefined };
			}

			const source = input.source?.trim();
			if (!source) throw new Error(`package_manage ${input.action} requires a source`);
			const local = input.scope === "project";
			if (input.action === "install") {
				await manager.installAndPersist(source, { local });
				return {
					content: [
						{
							type: "text",
							text: `Installed ${source} for ${local ? "this project" : "the user"}. Run /reload to activate it.`,
						},
					],
					details: undefined,
				};
			}

			const removed = await manager.removeAndPersist(source, { local });
			return {
				content: [
					{
						type: "text",
						text: removed
							? `Removed ${source} from ${local ? "project" : "user"} packages. Run /reload to refresh resources.`
							: `${source} was not configured for the ${local ? "project" : "user"} scope.`,
					},
				],
				details: undefined,
			};
		},
	};
}
