#!/usr/bin/env node

import { chmod, cp, lstat, mkdir, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const rootPackagePath = join(repoRoot, "package.json");
const codingAgentDir = join(repoRoot, "packages/coding-agent");
const shrinkwrapPath = join(codingAgentDir, "npm-shrinkwrap.json");
const internalPackagePrefix = "@reitaard/recode-";
const omittedOptionalPackages = new Set(["@mariozechner/clipboard"]);
const internalPackages = [
	["@reitaard/recode-agent-core", "packages/agent"],
	["@reitaard/recode-ai", "packages/ai"],
	["@reitaard/recode-coding-agent", "packages/coding-agent"],
	["@reitaard/recode-orchestrator", "packages/orchestrator"],
	["@reitaard/recode-storage-sqlite-node", "packages/storage/sqlite-node"],
	["@reitaard/recode-telemetry", "packages/telemetry"],
	["@reitaard/recode-tui", "packages/tui"],
];

function parseArgs(argv) {
	const options = {
		output: undefined,
		version: undefined,
		revision: "1",
		prefix: process.env.RECODE_TERMUX_PREFIX_B64
			? Buffer.from(process.env.RECODE_TERMUX_PREFIX_B64, "base64").toString("utf8")
			: "/data/data/com.termux/files/usr",
		architecture: "aarch64",
	};
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === "--output" || argument === "--version" || argument === "--revision" || argument === "--prefix" || argument === "--architecture") {
			const value = argv[++index];
			if (!value) throw new Error(`${argument} requires a value`);
			if (argument === "--output") options.output = value;
			if (argument === "--version") options.version = value;
			if (argument === "--revision") options.revision = value;
			if (argument === "--prefix") options.prefix = value;
			if (argument === "--architecture") options.architecture = value;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}
	if (!options.output) throw new Error("--output is required");
	return options;
}

function packageNameFromLockPath(lockPath) {
	const marker = "node_modules/";
	const index = lockPath.lastIndexOf(marker);
	if (index === -1) return undefined;
	const parts = lockPath.slice(index + marker.length).split("/");
	return parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

function runtimeManifest(packageJson, { omitOptional = false } = {}) {
	const fields = [
		"name",
		"version",
		"description",
		"private",
		"type",
		"main",
		"types",
		"exports",
		"bin",
		"sideEffects",
		"piConfig",
		"dependencies",
		"peerDependencies",
		"peerDependenciesMeta",
		"optionalDependencies",
		"engines",
	];
	const result = {};
	for (const field of fields) {
		if (packageJson[field] !== undefined) result[field] = packageJson[field];
	}
	if (omitOptional) delete result.optionalDependencies;
	return result;
}

function relativePrefix(prefix) {
	const normalized = prefix.replaceAll("\\", "/").replace(/^\/+/, "");
	if (!normalized || normalized.includes("..")) throw new Error(`Unsafe Termux prefix: ${prefix}`);
	return normalized;
}

function assertSafeOutput(output) {
	const resolved = resolve(output);
	const normalized = resolved.replaceAll("\\", "/").toLowerCase();
	if (!normalized.includes("termux")) {
		throw new Error(`Refusing to replace output outside a Termux build path: ${resolved}`);
	}
}

async function copyDirectory(source, destination) {
	await mkdir(dirname(destination), { recursive: true });
	await cp(source, destination, { recursive: true, dereference: true });
}

async function copyProductionDependency(repoRootPath, lockPath, destinationRoot, entry) {
	const source = join(repoRootPath, lockPath);
	try {
		await lstat(source);
	} catch {
		if (entry.optional || entry.os || entry.cpu || entry.libc) return false;
		throw new Error(`Production dependency is missing from node_modules: ${lockPath}`);
	}
	await copyDirectory(source, join(destinationRoot, lockPath));
	return true;
}

async function normalizeMtimes(root, epochSeconds) {
	const timestamp = new Date(epochSeconds * 1000);
	async function visit(path) {
		await utimes(path, timestamp, timestamp);
		for (const entry of await readdir(path, { withFileTypes: true })) {
			if (entry.isDirectory()) await visit(join(path, entry.name));
			else await utimes(join(path, entry.name), timestamp, timestamp);
		}
	}
	await visit(root);
}

function shellWrapper(prefix, target) {
	const normalizedPrefix = prefix.replaceAll("\\", "/").replace(/\/+$/, "");
	return `#!${normalizedPrefix}/bin/sh\nexec ${normalizedPrefix}/bin/node ${normalizedPrefix}/lib/recode/${target} "$@"\n`;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const rootPackage = JSON.parse(await readFile(rootPackagePath, "utf8"));
	const version = options.version ?? rootPackage.version;
	if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid Recode version: ${version}`);
	if (!/^\d+$/.test(options.revision)) throw new Error(`Invalid Debian revision: ${options.revision}`);
	assertSafeOutput(options.output);
	await rm(options.output, { recursive: true, force: true });

	const prefixRoot = join(resolve(options.output), relativePrefix(options.prefix));
	const runtimeRoot = join(prefixRoot, "lib/recode");
	const runtimeNodeModules = join(runtimeRoot, "node_modules");
	const packageRoot = join(resolve(options.output), "DEBIAN");
	await mkdir(runtimeRoot, { recursive: true });
	await mkdir(runtimeNodeModules, { recursive: true });
	await mkdir(packageRoot, { recursive: true });

	const codingAgentPackage = JSON.parse(await readFile(join(codingAgentDir, "package.json"), "utf8"));
	if (codingAgentPackage.version !== version) {
		throw new Error(`coding-agent version ${codingAgentPackage.version} does not match ${version}`);
	}
	await copyDirectory(join(codingAgentDir, "dist"), join(runtimeRoot, "dist"));
	await writeFile(join(runtimeRoot, "package.json"), `${JSON.stringify(runtimeManifest(codingAgentPackage, { omitOptional: true }), null, "\t")}\n`);

	const packageManifests = new Map();
	for (const [packageName, packageRelativePath] of internalPackages) {
		const packageDirectory = join(repoRoot, packageRelativePath);
		const packageJson = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
		if (packageJson.name !== packageName) throw new Error(`Manifest mismatch for ${packageRelativePath}`);
		if (packageJson.version !== version) throw new Error(`${packageName} version ${packageJson.version} does not match ${version}`);
		packageManifests.set(packageName, packageJson);
		const destination = join(runtimeNodeModules, packageName);
		await copyDirectory(join(packageDirectory, "dist"), join(destination, "dist"));
		await writeFile(join(destination, "package.json"), `${JSON.stringify(runtimeManifest(packageJson, { omitOptional: true }), null, "\t")}\n`);
	}

	const shrinkwrap = JSON.parse(await readFile(shrinkwrapPath, "utf8"));
	for (const [lockPath, entry] of Object.entries(shrinkwrap.packages)) {
		if (!lockPath || !lockPath.startsWith("node_modules/")) continue;
		const packageName = packageNameFromLockPath(lockPath);
		if (!packageName) continue;
		if (packageName.startsWith(internalPackagePrefix)) continue;
		if (omittedOptionalPackages.has(packageName) || packageName.startsWith("@mariozechner/clipboard-")) continue;
		await copyProductionDependency(repoRoot, lockPath, runtimeRoot, entry);
	}

	const binRoot = join(prefixRoot, "bin");
	await mkdir(binRoot, { recursive: true });
	const wrappers = {
		recode: "dist/cli.js",
		pi: "dist/pi.js",
		"recode-maestro": "node_modules/@reitaard/recode-orchestrator/dist/cli.js",
	};
	for (const [name, target] of Object.entries(wrappers)) {
		const wrapperPath = join(binRoot, name);
		await writeFile(wrapperPath, shellWrapper(options.prefix, target));
		await chmod(wrapperPath, 0o755);
	}

	const control = [
		"Package: recode",
		`Version: ${version}-${options.revision}`,
		`Architecture: ${options.architecture}`,
		"Section: devel",
		"Priority: optional",
		"Maintainer: Recode contributors",
		"Depends: nodejs, bash",
		"Homepage: https://github.com/reitaard/recode",
		"Description: Recode coding-agent runtime",
		" A standalone Termux runtime containing the seven Recode core packages.",
		" Extensions are installed separately through the bundled pi command.",
		"",
	].join("\n");
	await writeFile(join(packageRoot, "control"), control);

	const manifest = {
		package: "recode",
		version,
		revision: options.revision,
		architecture: options.architecture,
		prefix: options.prefix,
		internalPackages: [...packageManifests.keys()],
		omittedOptionalPackages: [...omittedOptionalPackages],
	};
	await writeFile(join(runtimeRoot, "termux-manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
	const sourceDateEpoch = Number.parseInt(process.env.SOURCE_DATE_EPOCH ?? "0", 10);
	if (!Number.isSafeInteger(sourceDateEpoch) || sourceDateEpoch < 0) {
		throw new Error("SOURCE_DATE_EPOCH must be a non-negative integer");
	}
	await normalizeMtimes(resolve(options.output), sourceDateEpoch);
	console.log(`Staged Recode ${version}-${options.revision} for ${options.architecture}: ${resolve(options.output)}`);
}

await main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
