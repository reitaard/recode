#!/usr/bin/env node
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { cwd } from "node:process";
import { fileURLToPath } from "node:url";
import type { RpcCommand, RpcExtensionUIResponse } from "@reitaard/recode-coding-agent";
import { getSocketPath, VERSION } from "./config.ts";
import { resolveMaestroInstance, runMaestroDashboard, searchMaestroInstances } from "./dashboard.ts";
import { createMaestroDiagnosticBundle } from "./diagnostics.ts";
import { sendIpcRequest } from "./ipc/client.ts";
import { encodeMessage } from "./ipc/protocol.ts";
import { type NativeServiceAction, NativeServiceManager } from "./native-service.ts";
import { serve } from "./serve.ts";
import { serveMaestro } from "./service-runtime.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function printHelp(): void {
	console.log(
		`Recode Maestro v${VERSION}\n\nUsage:\n  recode maestro tui [--search <query>]\n  recode maestro attach <session-id-or-label>\n  recode maestro search <query>\n  recode maestro service <install|uninstall|start|stop|restart|status>\n  recode maestro service run [--supervision <manual|systemd|windows-task>]\n  recode maestro health\n  recode maestro diagnose\n  recode maestro list\n  recode maestro spawn (--read-only | --write) [--cwd <path>] [--label <label>] [--parent <instance-id>]\n  recode maestro status <instance-id>\n  recode maestro cancel <instance-id>\n  recode maestro stop <instance-id>\n  recode maestro rpc <instance-id> <json-command>\n  recode maestro rpc-stream <instance-id>\n  recode maestro --help\n  recode maestro --version\n\nThe native service owns all full-session children. Closing the TUI detaches; stop is destructive.`,
	);
}

function printResponse(response: unknown): void {
	console.log(JSON.stringify(response, null, 2));
}

function getFlagValue(args: string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	if (index === -1 || index + 1 >= args.length) {
		return undefined;
	}
	return args[index + 1];
}

async function rpcStream(instanceId: string): Promise<void> {
	const socket = createConnection(getSocketPath());
	let stdinBuffer = "";
	process.stdin.setEncoding("utf8");

	await new Promise<void>((resolve, reject) => {
		socket.once("connect", () => {
			socket.write(encodeMessage({ type: "rpc_stream", instanceId }));
			resolve();
		});
		socket.once("error", reject);
	});

	socket.on("data", (chunk: Buffer | string) => {
		process.stdout.write(chunk.toString());
	});
	console.error(`connected to rpc stream ${instanceId}; send JSONL RpcCommand or extension_ui_response on stdin`);
	socket.on("error", (error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
	socket.on("end", () => {
		process.exit(0);
	});
	process.stdin.on("data", (chunk: string) => {
		stdinBuffer += chunk;
		while (true) {
			const newlineIndex = stdinBuffer.indexOf("\n");
			if (newlineIndex === -1) {
				return;
			}
			const line = stdinBuffer.slice(0, newlineIndex).trim();
			stdinBuffer = stdinBuffer.slice(newlineIndex + 1);
			if (!line) {
				continue;
			}
			const parsed = JSON.parse(line) as RpcCommand | RpcExtensionUIResponse;
			socket.write(encodeMessage(parsed));
		}
	});
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		printHelp();
		process.exit(0);
	}

	if (args[0] === "--version" || args[0] === "-v") {
		console.log(VERSION);
		process.exit(0);
	}

	if (args[0] === "serve") {
		await serve();
		return;
	}

	if (args[0] === "service") {
		const action = args[1];
		if (action === "run") {
			const supervision = getFlagValue(args, "--supervision");
			if (
				supervision !== undefined &&
				supervision !== "manual" &&
				supervision !== "systemd" &&
				supervision !== "windows-task"
			) {
				throw new Error(`Unsupported Maestro supervision mode: ${supervision}`);
			}
			await serveMaestro({ supervisionMode: supervision });
			return;
		}
		const nativeActions: readonly NativeServiceAction[] = [
			"install",
			"uninstall",
			"start",
			"stop",
			"restart",
			"status",
		];
		if (!action || !nativeActions.includes(action as NativeServiceAction)) {
			console.error("Usage: recode maestro service <install|uninstall|start|stop|restart|status>");
			process.exit(1);
		}
		const result = await new NativeServiceManager().execute(action as NativeServiceAction);
		if (result) console.log(result);
		return;
	}

	if (args[0] === "tui") {
		await runMaestroDashboard(undefined, { initialQuery: getFlagValue(args, "--search") });
		return;
	}

	if (args[0] === "attach") {
		const selector = args[1];
		if (!selector) {
			console.error("Usage: recode maestro attach <session-id-or-label>");
			process.exit(1);
		}
		const response = await sendIpcRequest({ type: "list" });
		if (response.type !== "list_result" || !response.ok || !response.instances) {
			throw new Error(response.error ?? "Unable to list Maestro sessions");
		}
		const instance = resolveMaestroInstance(response.instances, selector);
		await runMaestroDashboard(undefined, { initialSelector: instance.id });
		return;
	}

	if (args[0] === "search") {
		const query = args.slice(1).join(" ").trim();
		if (!query) {
			console.error("Usage: recode maestro search <query>");
			process.exit(1);
		}
		const response = await sendIpcRequest({ type: "list" });
		if (response.type !== "list_result" || !response.ok || !response.instances) {
			printResponse(response);
			return;
		}
		printResponse({ ...response, instances: searchMaestroInstances(response.instances, query) });
		return;
	}

	if (args[0] === "health") {
		printResponse(await sendIpcRequest({ type: "health" }));
		return;
	}

	if (args[0] === "diagnose") {
		printResponse(
			createMaestroDiagnosticBundle({
				version: VERSION,
				releaseManifestPath: join(__dirname, "recode-release.json"),
			}),
		);
		return;
	}

	if (args[0] === "list") {
		printResponse(await sendIpcRequest({ type: "list" }));
		return;
	}

	if (args[0] === "spawn") {
		const readOnly = args.includes("--read-only");
		const write = args.includes("--write");
		if (readOnly === write) {
			console.error("Usage: orchestrator spawn (--read-only | --write) [--cwd <path>] [--label <label>]");
			process.exit(1);
		}
		const spawnCwd = getFlagValue(args, "--cwd") ?? cwd();
		const label = getFlagValue(args, "--label");
		const parentInstanceId = getFlagValue(args, "--parent");
		printResponse(
			await sendIpcRequest({
				type: "spawn",
				cwd: spawnCwd,
				workspaceAccess: readOnly ? "read-only" : "write",
				label,
				parentInstanceId,
			}),
		);
		return;
	}

	if (args[0] === "status") {
		const instanceId = args[1];
		if (!instanceId) {
			console.error("Usage: orchestrator status <instance-id>");
			process.exit(1);
		}
		printResponse(await sendIpcRequest({ type: "status", instanceId }));
		return;
	}

	if (args[0] === "cancel") {
		const instanceId = args[1];
		if (!instanceId) {
			console.error("Usage: recode maestro cancel <instance-id>");
			process.exit(1);
		}
		printResponse(await sendIpcRequest({ type: "cancel", instanceId }));
		return;
	}

	if (args[0] === "stop") {
		const instanceId = args[1];
		if (!instanceId) {
			console.error("Usage: orchestrator stop <instance-id>");
			process.exit(1);
		}
		printResponse(await sendIpcRequest({ type: "stop", instanceId }));
		return;
	}

	if (args[0] === "rpc") {
		const instanceId = args[1];
		const commandJson = args[2];
		if (!instanceId || !commandJson) {
			console.error("Usage: orchestrator rpc <instance-id> <json-command>");
			process.exit(1);
		}
		printResponse(
			await sendIpcRequest({
				type: "rpc",
				instanceId,
				command: JSON.parse(commandJson),
			}),
		);
		return;
	}

	if (args[0] === "rpc-stream") {
		const instanceId = args[1];
		if (!instanceId) {
			console.error("Usage: orchestrator rpc-stream <instance-id>");
			process.exit(1);
		}
		await rpcStream(instanceId);
		return;
	}

	console.error(`Unknown command: ${args[0]}`);
	printHelp();
	process.exit(1);
}

try {
	await main();
} catch (error) {
	const code = error instanceof Error && "code" in error ? error.code : undefined;
	const message = error instanceof Error ? error.message : String(error);
	if (code === "ENOENT" || code === "ECONNREFUSED" || message.includes("start the service first")) {
		console.error("Recode Maestro service is not running. Start it with: recode maestro service start");
	} else {
		console.error(`Error: ${message}`);
	}
	process.exitCode = 1;
}
