#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
	const options = {};
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === "--root" || argument === "--version") {
			const value = argv[++index];
			if (!value) throw new Error(`${argument} requires a value`);
			options[argument.slice(2)] = value;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	if (!options.root || !options.version) throw new Error("--root and --version are required");
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

async function listFiles(root) {
	const files = [];
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) await visit(path);
			else files.push(path);
		}
	}
	await visit(root);
	return files.sort((left, right) => left.localeCompare(right));
}

function relativeName(root, path) {
	return relative(root, path).split(sep).join("/");
}

async function describeFile(root, path) {
	const content = await readFile(path);
	return {
		path: relativeName(root, path),
		bytes: (await stat(path)).size,
		sha256: createHash("sha256").update(content).digest("hex"),
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const bundleRoot = resolve(options.root);
	const files = await listFiles(bundleRoot);
	const manifestPath = join(bundleRoot, "BUNDLE-MANIFEST.json");
	const checksumPath = join(bundleRoot, "SHA256SUMS");
	const payloads = [];
	for (const path of files) {
		if (path === manifestPath || path === checksumPath) continue;
		payloads.push(await describeFile(bundleRoot, path));
	}

	const manifest = {
		schemaVersion: 1,
		release: "recode",
		version: options.version,
		source: {
			repository: "https://github.com/reitaard/recode",
			commit: await git(["rev-parse", "HEAD"]),
			workingTree: (await git(["status", "--porcelain"])) ? "modified" : "clean",
		},
		contents: {
			packageTarballs: payloads.filter((file) => file.path.startsWith("packages/")).map((file) => file.path),
			termuxPackages: payloads.filter((file) => file.path.startsWith("termux/")).map((file) => file.path),
			extensionsBundled: false,
			optionalWebAccess: "pi install npm:pi-web-access",
		},
		files: payloads,
	};
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

	const checksumFiles = await listFiles(bundleRoot);
	const checksums = [];
	for (const path of checksumFiles) {
		if (path === checksumPath) continue;
		const file = await describeFile(bundleRoot, path);
		checksums.push(`${file.sha256}  ${file.path}`);
	}
	await writeFile(checksumPath, `${checksums.join("\n")}\n`);
	console.log(`Wrote ${manifestPath} and ${checksumPath}`);
}

await main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
