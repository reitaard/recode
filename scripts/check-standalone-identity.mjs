#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const packages = [
	"packages/telemetry/package.json",
	"packages/ai/package.json",
	"packages/agent/package.json",
	"packages/storage/sqlite-node/package.json",
	"packages/tui/package.json",
	"packages/coding-agent/package.json",
	"packages/orchestrator/package.json",
];
const expected = new Map([
	["packages/telemetry/package.json", "@reitaard/recode-telemetry"],
	["packages/ai/package.json", "@reitaard/recode-ai"],
	["packages/agent/package.json", "@reitaard/recode-agent-core"],
	["packages/storage/sqlite-node/package.json", "@reitaard/recode-storage-sqlite-node"],
	["packages/tui/package.json", "@reitaard/recode-tui"],
	["packages/coding-agent/package.json", "@reitaard/recode-coding-agent"],
	["packages/orchestrator/package.json", "@reitaard/recode-orchestrator"],
]);

const failures = [];
for (const path of packages) {
	const manifest = JSON.parse(await readFile(path, "utf8"));
	if (manifest.name !== expected.get(path)) failures.push(`${path}: unexpected name ${manifest.name}`);
	if (manifest.version !== "0.1.2") failures.push(`${path}: expected version 0.1.2, found ${manifest.version}`);
	if (manifest.private !== true) failures.push(`${path}: publication must remain private`);
	if (!String(manifest.scripts?.prepublishOnly ?? "").includes("throw")) {
		failures.push(`${path}: prepublishOnly must fail closed`);
	}
	for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
		for (const [name, range] of Object.entries(manifest[section] ?? {})) {
			if (name.startsWith("@reitaard/repi-")) failures.push(`${path}: predecessor dependency ${name}`);
			if (name.startsWith("@reitaard/recode-") && range !== "^0.1.2") {
				failures.push(`${path}: internal dependency ${name} must use ^0.1.2, found ${range}`);
			}
		}
	}
}

if (failures.length) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("standalone identity check passed for seven packages at 0.1.2");
