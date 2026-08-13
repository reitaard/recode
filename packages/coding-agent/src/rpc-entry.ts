#!/usr/bin/env node
import { APP_NAME } from "./config.ts";
import { installPiPackageCompatibilityHooks } from "./core/extensions/pi-package-compat.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { RecodeMemoryRuntime } from "./core/recode-memory/recode-memory-runtime.ts";
import { main } from "./main.ts";
import { recodeMemory } from "./recode-memory.ts";
import { recodeOpenProvider } from "./recode-open-provider.ts";
import { recodeOpenAIOAuth } from "./recode-openai-oauth.ts";

process.title = `${APP_NAME}-rpc`;
process.env.PI_CODING_AGENT = "true";
process.env.AI_AGENT = "pi";
process.emitWarning = (() => {}) as typeof process.emitWarning;

await installPiPackageCompatibilityHooks();
configureHttpDispatcher();

const memoryRuntime = new RecodeMemoryRuntime();
try {
	await main(["--mode", "rpc", ...process.argv.slice(2)], {
		extensionFactories: [
			{ name: "recode-open-provider", factory: recodeOpenProvider },
			{ name: "recode-openai-oauth", factory: recodeOpenAIOAuth },
			{ name: "recode-memory", factory: (pi) => recodeMemory(pi, memoryRuntime) },
		],
	});
} finally {
	memoryRuntime.close();
}
