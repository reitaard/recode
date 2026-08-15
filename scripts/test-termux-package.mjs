#!/usr/bin/env node

import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const internalPackages = [
	"@reitaard/recode-agent-core",
	"@reitaard/recode-ai",
	"@reitaard/recode-coding-agent",
	"@reitaard/recode-orchestrator",
	"@reitaard/recode-storage-sqlite-node",
	"@reitaard/recode-telemetry",
	"@reitaard/recode-tui",
];

function parseArgs(argv) {
	let root;
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === "--root") {
			root = argv[++index];
			if (!root) throw new Error("--root requires a value");
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	if (!root) throw new Error("Usage: node scripts/test-termux-package.mjs --root <extracted-or-staged-root>");
	return resolve(root);
}

async function mustExist(path) {
	try {
		await access(path);
	} catch {
		throw new Error(`Required package path is missing: ${path}`);
	}
}

async function findPrefix(root) {
	const candidates = [
		join(root, "data/data/com.termux/files/usr"),
		join(root, "usr"),
		root,
	];
	for (const candidate of candidates) {
		try {
			await access(join(candidate, "lib/recode/dist/cli.js"));
			return candidate;
		} catch {}
	}
	throw new Error(`Could not locate a Termux Recode runtime below ${root}`);
}

async function findForbiddenRuntimeFiles(root) {
	const forbidden = [];
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}
			if (entry.name.endsWith(".node") || path.includes("node_modules/@mariozechner/clipboard")) forbidden.push(path);
		}
	}
	await visit(root);
	return forbidden;
}

async function runVersion(runtimeRoot, entry, expected) {
	const result = await execFileAsync(process.execPath, [join(runtimeRoot, entry), "--version"], {
		cwd: runtimeRoot,
		env: { ...process.env, PI_OFFLINE: "1" },
		maxBuffer: 1024 * 1024,
	});
	if (result.stdout.trim() !== expected) {
		throw new Error(`${entry} reported ${JSON.stringify(result.stdout.trim())}; expected ${expected}`);
	}
}

async function main() {
	const root = parseArgs(process.argv.slice(2));
	const prefix = await findPrefix(root);
	const runtimeRoot = join(prefix, "lib/recode");
	const manifest = JSON.parse(await readFile(join(runtimeRoot, "termux-manifest.json"), "utf8"));
	await mustExist(join(runtimeRoot, "dist/cli.js"));
	await mustExist(join(runtimeRoot, "dist/pi.js"));
	await mustExist(join(prefix, "bin/recode"));
	await mustExist(join(prefix, "bin/pi"));
	await mustExist(join(prefix, "bin/recode-maestro"));

	for (const packageName of internalPackages) {
		const packageRoot = join(runtimeRoot, "node_modules", packageName);
		await mustExist(join(packageRoot, "package.json"));
		await mustExist(join(packageRoot, "dist"));
	}

	const forbidden = [
		join(runtimeRoot, "node_modules/pi-web-access"),
		join(runtimeRoot, "skills"),
		join(runtimeRoot, "node_modules/@mariozechner/clipboard"),
	];
	for (const path of forbidden) {
		try {
			await access(path);
			throw new Error(`Forbidden optional/extension content is present: ${path}`);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Forbidden")) throw error;
		}
	}
	const forbiddenRuntimeFiles = await findForbiddenRuntimeFiles(runtimeRoot);
	if (forbiddenRuntimeFiles.length > 0) {
		throw new Error(`Forbidden native/clipboard files are present:\n${forbiddenRuntimeFiles.join("\n")}`);
	}

	if (manifest.internalPackages.join("\n") !== internalPackages.join("\n")) {
		throw new Error("Termux manifest does not contain the expected seven core packages");
	}
	await runVersion(runtimeRoot, "dist/cli.js", manifest.version);
	await runVersion(runtimeRoot, "dist/pi.js", manifest.version);
	await runVersion(join(runtimeRoot, "node_modules/@reitaard/recode-orchestrator"), "dist/cli.js", manifest.version);
	console.log(`Termux package smoke test passed for Recode ${manifest.version}`);
}

await main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
