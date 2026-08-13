#!/usr/bin/env node
/**
 * CLI entry point for the refactored coding agent.
 * Uses main.ts with AgentSession and new mode modules.
 *
 * Test with: npx tsx src/cli-new.ts [args...]
 */
import { APP_NAME } from "./config.ts";
import { installPiPackageCompatibilityHooks } from "./core/extensions/pi-package-compat.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { runDoctor } from "./doctor.ts";
import { handlePackageCommand } from "./package-manager-cli.ts";
import { handleRepiUpstreamCommand } from "./recode/update/upstream-plan.ts";

process.title = APP_NAME;
process.env.PI_CODING_AGENT = "true";
process.env.AI_AGENT = "pi";
process.emitWarning = (() => {}) as typeof process.emitWarning;

const args = process.argv.slice(2);

if (args[0] === "doctor") {
	process.exitCode = await runDoctor(args.slice(1));
} else {
	// Must run before loading Recode or third-party extension modules.
	await installPiPackageCompatibilityHooks();

	// Configure undici before provider SDKs issue requests.
	configureHttpDispatcher();

	const upstreamResult = handleRepiUpstreamCommand(args);
	const selfUpdateOnly =
		args[0] === "update" &&
		!args.slice(1).some((arg) => arg === "--extensions" || arg === "--all" || arg === "--extension") &&
		!args.slice(1).some((arg) => !arg.startsWith("-") && arg !== "self" && arg !== "pi");
	if (upstreamResult.handled) {
		process.exitCode = upstreamResult.exitCode;
	} else if (selfUpdateOnly) {
		await handlePackageCommand(args);
	} else if (args[0] === "telegram") {
		const { runRecodeTelegramGateway } = await import("./recode-telegram-gateway.ts");

		void runRecodeTelegramGateway().catch((error: unknown) => {
			console.error(error instanceof Error ? `Error: ${error.message}` : `Error: ${String(error)}`);
			process.exitCode = 1;
		});
	} else {
		const [{ RecodeMemoryRuntime }, { main }, { recodeMemory }, { recodeOpenProvider }, { recodeOpenAIOAuth }] =
			await Promise.all([
				import("./core/recode-memory/recode-memory-runtime.ts"),
				import("./main.ts"),
				import("./recode-memory.ts"),
				import("./recode-open-provider.ts"),
				import("./recode-openai-oauth.ts"),
			]);

		const memoryRuntime = new RecodeMemoryRuntime();

		void main(args, {
			extensionFactories: [
				{ name: "recode-open-provider", factory: recodeOpenProvider },
				{ name: "recode-openai-oauth", factory: recodeOpenAIOAuth },
				{ name: "recode-memory", factory: (pi) => recodeMemory(pi, memoryRuntime) },
			],
		}).finally(() => memoryRuntime.close());
	}
}
