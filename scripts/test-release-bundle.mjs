#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

function parseArgs(argv) {
	if (argv.length !== 2 || argv[0] !== "--root") throw new Error("Usage: node scripts/test-release-bundle.mjs --root EXTRACTED_BUNDLE_ROOT");
	return resolve(argv[1]);
}

async function hashFile(path) {
	return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function main() {
	const root = parseArgs(process.argv.slice(2));
	const manifest = JSON.parse(await readFile(join(root, "BUNDLE-MANIFEST.json"), "utf8"));
	const checksums = (await readFile(join(root, "SHA256SUMS"), "utf8"))
		.trim()
		.split(/\r?\n/)
		.filter(Boolean);
	if (manifest.contents.packageTarballs.length !== 7) throw new Error("Bundle must contain seven package tarballs");
	if (manifest.contents.termuxPackages.length !== 1) throw new Error("Bundle must contain one Termux package");
	if (manifest.contents.extensionsBundled !== false) throw new Error("Bundle must not include third-party extensions");

	const manifestFiles = new Map();
	for (const file of manifest.files) {
		const path = join(root, file.path);
		const actual = await hashFile(path);
		if (actual !== file.sha256) throw new Error(`Manifest hash mismatch: ${file.path}`);
		if ((await stat(path)).size !== file.bytes) throw new Error(`Manifest size mismatch: ${file.path}`);
		manifestFiles.set(file.path, actual);
	}

	for (const line of checksums) {
		const match = line.match(/^([a-f0-9]{64})  (.+)$/);
		if (!match) throw new Error(`Invalid checksum line: ${line}`);
		const [, expected, relativePath] = match;
		const actual = await hashFile(join(root, relativePath));
		if (actual !== expected) throw new Error(`Checksum mismatch: ${relativePath}`);
		if (relativePath !== "BUNDLE-MANIFEST.json" && manifestFiles.get(relativePath) !== actual) {
			throw new Error(`Checksum is not represented in the manifest: ${relativePath}`);
		}
	}

	console.log(`Release bundle smoke test passed for Recode ${manifest.version}`);
}

await main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
