import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = manifest.version;
const failures = [];

const packageDirs = [
	"packages/agent",
	"packages/ai",
	"packages/coding-agent",
	"packages/orchestrator",
	"packages/storage/sqlite-node",
	"packages/telemetry",
	"packages/tui",
];

for (const dir of packageDirs) {
	const packageManifest = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
	if (packageManifest.version !== version) {
		failures.push(`${dir}/package.json: version ${packageManifest.version} does not match root ${version}`);
	}
	const changelogPath = join(root, dir, "CHANGELOG.md");
	const changelog = readFileSync(changelogPath, "utf8");
	if (!new RegExp(`^## \\[?${version.replaceAll(".", "\\.")}\\]?`, "m").test(changelog)) {
		failures.push(`${dir}/CHANGELOG.md: missing release entry for ${version}`);
	}
}

const currentVersionDocs = ["README.md", "docs/project/CURRENT.md", "docs/project/CORE.md", "docs/setup/BUILD.md", "docs/setup/RELEASE.md"];
for (const path of currentVersionDocs) {
	const text = readFileSync(join(root, path), "utf8");
	if (!text.includes(version)) failures.push(`${path}: does not mention current version ${version}`);
}

const dependencyFiles = ["package.json", "package-lock.json", "packages/coding-agent/npm-shrinkwrap.json"];
for (const dir of packageDirs) dependencyFiles.push(`${dir}/package.json`);
for (const path of dependencyFiles) {
	const text = readFileSync(join(root, path), "utf8");
	if (text.includes('"@reitaard/repi-')) failures.push(`${path}: contains a predecessor package dependency`);
}

const scanRoots = ["packages", "scripts", "README.md", "docs/project", "docs/setup", "docs/use", "docs/workers"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md"]);
const excludedSegments = [
	"/test/",
	"/tests/",
	"/dist/",
	"/node_modules/",
	"/docs/old/",
	"/docs/migration/",
	"/packages/coding-agent/src/client/", // Explicitly excluded legacy client surface; not built or exported.
];
const excludedFiles = new Set([
	"packages/coding-agent/CHANGELOG.md",
	"packages/agent/CHANGELOG.md",
	"packages/ai/CHANGELOG.md",
	"packages/orchestrator/CHANGELOG.md",
	"packages/storage/sqlite-node/CHANGELOG.md",
	"packages/telemetry/CHANGELOG.md",
	"packages/tui/CHANGELOG.md",
	"scripts/check-migration-closure.mjs",
	"scripts/check-standalone-identity.mjs",
]);

const allowedLegacyRules = [
	{
		path: "packages/coding-agent/src/core/extensions/pi-package-compat.ts",
		label: "predecessor package identity",
		line: /^\s*\["@reitaard\/repi-[^"]+", "@reitaard\/recode-[^"]+"\],$/,
	},
	{
		path: "packages/coding-agent/src/core/package-manager.ts",
		label: "predecessor package identity",
		line: /@reitaard\/repi-\* peers/,
	},
	{
		path: "packages/coding-agent/src/core/agent-session-services.ts",
		label: "predecessor environment identity",
		line: /LEGACY_DELEGATION_ENV = "REPI_DELEGATION"/,
	},
	{
		path: "packages/orchestrator/src/child-environment.ts",
		label: "predecessor environment identity",
		line: /source\.REPI_(?:MAESTRO_CHILD_ENV_ALLOW|DELEGATION)/,
	},
	{
		path: "packages/orchestrator/src/service-runtime.ts",
		label: "predecessor environment identity",
		line: /process\.env\.REPI_MAESTRO_(?:SUPERVISION|WATCHER)/,
	},
	{
		path: "packages/tui/src/terminal.ts",
		label: "predecessor environment identity",
		line: /REPI_TERMINAL_BINDING/,
	},
	{
		path: "packages/tui/src/index.ts",
		label: "predecessor environment identity",
		line: /REPI_TERMINAL_BINDING/,
	},
	{
		path: "packages/coding-agent/src/core/terminal-setup.ts",
		label: "predecessor environment identity",
		line: /REPI_TERMINAL_BINDING/,
	},
	{
		path: "packages/tui/README.md",
		label: "predecessor environment identity",
		line: /REPI_TERMINAL_BINDING_SEQUENCES.*compatibility API/,
	},
	{
		path: "packages/coding-agent/docs/packages.md",
		label: "predecessor package identity",
		line: /Runtime-only aliases.*@reitaard\/repi-/,
	},
	{
		path: "docs/setup/BUILD.md",
		label: "predecessor package identity",
		line: /npm uninstall --global @reitaard\/repi-coding-agent/,
	},
	{
		path: "docs/workers/DESIGN.md",
		label: "predecessor environment identity",
		line: /REPI_DELEGATION.*read-only fallback/,
	},
];

const stalePatterns = [
	{ label: "predecessor package identity", regex: /@reitaard\/repi-/ },
	{ label: "predecessor environment identity", regex: /\bREPI_[A-Z0-9_]+\b/ },
	{ label: "predecessor product name", regex: /\bRePi\b|\bre\.pi\b/ },
	{ label: "predecessor repository URL", regex: /github\.com\/reitaard\/(?:re\.pi|repi)/i },
];

function visit(path) {
	const absolute = join(root, path);
	const normalized = `/${path.replaceAll("\\", "/")}`;
	if (excludedSegments.some((segment) => normalized.includes(segment))) return;
	const stat = statSync(absolute);
	if (stat.isDirectory()) {
		for (const entry of readdirSync(absolute)) visit(join(path, entry));
		return;
	}
	const portablePath = relative(root, absolute).replaceAll("\\", "/");
	if (excludedFiles.has(portablePath)) return;
	const dot = portablePath.lastIndexOf(".");
	if (dot === -1 || !extensions.has(portablePath.slice(dot))) return;
	const lines = readFileSync(absolute, "utf8").split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) {
		for (const pattern of stalePatterns) {
			if (!pattern.regex.test(lines[index])) continue;
			const allowed = allowedLegacyRules.some(
				(rule) => rule.path === portablePath && rule.label === pattern.label && rule.line.test(lines[index]),
			);
			if (allowed) continue;
			failures.push(`${portablePath}:${index + 1}: unreviewed ${pattern.label}`);
		}
	}
}

for (const scanRoot of scanRoots) visit(scanRoot);

const emissionChecks = [
	["packages/orchestrator/src/native-service.ts", /Environment=REPI_/],
	["packages/orchestrator/src/child-environment.ts", /result\.REPI_[A-Z0-9_]+\s*=/],
];
for (const [path, regex] of emissionChecks) {
	if (regex.test(readFileSync(join(root, path), "utf8"))) failures.push(`${path}: newly emits a predecessor REPI_* variable`);
}

if (failures.length > 0) {
	console.error(`migration closure check failed with ${failures.length} issue(s):`);
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

console.log(`migration closure check passed for seven packages at ${version}`);
