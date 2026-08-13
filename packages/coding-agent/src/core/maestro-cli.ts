import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function resolveMaestroCommand(): { command: string; args: string[] } {
	const binaryName = process.platform === "win32" ? "recode-maestro.exe" : "recode-maestro";
	const binaryPath = join(dirname(process.execPath), binaryName);
	if (existsSync(binaryPath)) return { command: binaryPath, args: [] };
	const currentModulePath = fileURLToPath(import.meta.url);
	if (currentModulePath.endsWith(".ts")) {
		const workspaceCliPath = resolve(dirname(currentModulePath), "../../../orchestrator/src/cli.ts");
		if (existsSync(workspaceCliPath)) return { command: process.execPath, args: [workspaceCliPath] };
	}
	try {
		return {
			command: process.execPath,
			args: [fileURLToPath(import.meta.resolve("@reitaard/recode-orchestrator/cli"))],
		};
	} catch (error) {
		throw new Error(
			`Recode Maestro is unavailable in this installation: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/** Route `recode maestro` before the foreground Aizen runtime performs any startup work. */
export async function handleMaestroCommand(args: readonly string[]): Promise<boolean> {
	if (args[0] !== "maestro") return false;
	const resolved = resolveMaestroCommand();
	const child = spawn(resolved.command, [...resolved.args, ...args.slice(1)], {
		stdio: "inherit",
		env: process.env,
		windowsHide: false,
	});
	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`Recode Maestro exited from signal ${signal}`));
				return;
			}
			resolve(code ?? 1);
		});
	});
	process.exitCode = exitCode;
	return true;
}
