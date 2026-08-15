#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
	const options = {};
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === "--package" || argument === "--output" || argument === "--version" || argument === "--architecture") {
			const value = argv[++index];
			if (!value) throw new Error(`${argument} requires a value`);
			options[argument.slice(2)] = value;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	for (const required of ["package", "output", "version", "architecture"]) {
		if (!options[required]) throw new Error(`--${required} is required`);
	}
	return options;
}

async function git(args) {
	try {
		const result = await execFileAsync("git", args, { cwd: repoRoot });
		return result.stdout.trim();
	} catch {
		return "unknown";
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const packagePath = resolve(options.package);
	const outputDir = resolve(options.output);
	const packageInfo = await stat(packagePath);
	const packageBytes = await readFile(packagePath);
	const sha256 = createHash("sha256").update(packageBytes).digest("hex");
	const packageName = basename(packagePath);
	const commit = await git(["rev-parse", "HEAD"]);
	const status = await git(["status", "--porcelain"]);
	const nodeVersion = process.version;
	await mkdir(outputDir, { recursive: true });

	await writeFile(resolve(outputDir, "SHA256SUMS"), `${sha256}  ${packageName}\n`);
	const provenance = {
		schemaVersion: 1,
		artifact: {
			name: "recode",
			filename: packageName,
			version: options.version,
			architecture: options.architecture,
			bytes: packageInfo.size,
			sha256,
		},
		source: {
			repository: "https://github.com/reitaard/recode",
			commit,
			workingTree: status ? "modified" : "clean",
		},
		build: {
			node: nodeVersion,
			builder: "scripts/build-termux-release.sh --docker",
			platform: `${process.platform}-${process.arch}`,
		},
		contents: {
			corePackages: [
				"@reitaard/recode-agent-core",
				"@reitaard/recode-ai",
				"@reitaard/recode-coding-agent",
				"@reitaard/recode-orchestrator",
				"@reitaard/recode-storage-sqlite-node",
				"@reitaard/recode-telemetry",
				"@reitaard/recode-tui",
			],
			extensionsBundled: false,
			optionalWebAccess: "pi install npm:pi-web-access",
		},
		limitations: [
			"aarch64 package candidate; real Android/Termux device certification is still required",
			"native clipboard and TUI addons are omitted",
			"live providers and external services are not tested by this artifact build",
		],
	};
	await writeFile(resolve(outputDir, "PROVENANCE.json"), `${JSON.stringify(provenance, null, "\t")}\n`);
	console.log(`Wrote ${resolve(outputDir, "SHA256SUMS")} and ${resolve(outputDir, "PROVENANCE.json")}`);
}

await main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
