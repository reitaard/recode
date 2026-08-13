#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const roots = ["package.json", "packages", "scripts"]; // Historical docs are intentionally outside active safety scanning.
const forbiddenFiles = [
	"scripts/publish.mjs",
	"scripts/release.mjs",
	"scripts/install-local.mjs",
	"scripts/build-binaries.sh",
	"scripts/build-termux-release.sh",
	"scripts/publish-release-announcement.mjs",
];
const failures = [];

for (const path of forbiddenFiles) {
	try {
		await stat(path);
		failures.push(`${path}: remote/release/install automation must remain absent during bootstrap`);
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
}

async function walk(path) {
	const info = await stat(path);
	if (info.isFile()) return [path];
	const files = [];
	for (const entry of await readdir(path, { withFileTypes: true })) {
		if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
		files.push(...(await walk(join(path, entry.name))));
	}
	return files;
}

const files = (await Promise.all(roots.map(walk))).flat();
for (const path of files) {
	if (!/\.(?:json|mjs|js|ts|sh)$/u.test(path)) continue;
	const content = await readFile(path, "utf8");
	if (/https:\/\/radius\.pi\.dev/iu.test(content)) failures.push(`${relative(".", path)}: active inherited Radius URL`);
	if (/git\+https:\/\/github\.com\/reitaard\/re\.pi\.git/iu.test(content)) {
		failures.push(`${relative(".", path)}: inherited repository URL`);
	}
}

if (failures.length) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("standalone safety check passed: mutation automation absent and active inherited endpoints removed");
