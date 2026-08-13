import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnProcessSync } from "../../utils/child-process.ts";

const OWNERSHIP_PATH = join("recode", "upstream-ownership.json");

interface UpstreamOwnership {
	schemaVersion: 1;
	upstreamBase: string;
	defaultTarget: string;
	protectedPaths: string[];
}

export interface TreeEntry {
	mode: string;
	type: string;
	object: string;
}

export type UpstreamFileClassification =
	| "custom-only"
	| "upstream-only"
	| "identical-change"
	| "protected-upstream-change"
	| "overlap"
	| "rename-review";

export interface UpstreamFileChange {
	path: string;
	classification: UpstreamFileClassification;
	ours: "added" | "deleted" | "modified" | "unchanged";
	upstream: "added" | "deleted" | "modified" | "unchanged";
	protected: boolean;
}

export interface UpstreamPlan {
	root: string;
	base: string;
	baseCommit: string;
	oursCommit: string;
	target: string;
	targetCommit: string;
	protectedPaths: string[];
	counts: Record<UpstreamFileClassification, number>;
	changes: UpstreamFileChange[];
}

export interface UpstreamCommandResult {
	handled: boolean;
	exitCode: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isRecodeRoot(directory: string): boolean {
	const productPath = join(directory, "recode", "product.json");
	if (!existsSync(join(directory, ".git")) || !existsSync(productPath)) return false;
	try {
		const product: unknown = JSON.parse(readFileSync(productPath, "utf8"));
		return isRecord(product) && product.productName === "Recode" && product.appName === "recode";
	} catch {
		return false;
	}
}

export function findRecodeSourceCheckout(start: string): string | undefined {
	let current = resolve(start);
	while (true) {
		if (isRecodeRoot(current)) return current;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function readOwnership(root: string): UpstreamOwnership {
	const path = join(root, OWNERSHIP_PATH);
	if (!existsSync(path)) throw new Error(`Missing Recode upstream ownership manifest: ${path}`);
	const value: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (
		!isRecord(value) ||
		value.schemaVersion !== 1 ||
		typeof value.upstreamBase !== "string" ||
		!/^[0-9a-f]{40}$/.test(value.upstreamBase) ||
		typeof value.defaultTarget !== "string" ||
		!value.defaultTarget.trim() ||
		!Array.isArray(value.protectedPaths) ||
		!value.protectedPaths.every((entry) => typeof entry === "string" && entry.trim())
	) {
		throw new Error(`Invalid Recode upstream ownership manifest: ${path}`);
	}
	return {
		schemaVersion: 1,
		upstreamBase: value.upstreamBase,
		defaultTarget: value.defaultTarget.trim(),
		protectedPaths: value.protectedPaths.map((entry) => entry.trim()),
	};
}

function git(root: string, args: string[]): string {
	const result = spawnProcessSync("git", ["-C", root, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status === 0) return result.stdout;
	const reason = result.stderr.trim() || `exit code ${result.status ?? "unknown"}`;
	throw new Error(`git ${args.join(" ")} failed: ${reason}`);
}

function resolveCommit(root: string, revision: string): string {
	const commit = git(root, ["rev-list", "--max-count=1", revision, "--"]).trim();
	if (!commit) throw new Error(`Cannot resolve Git commit: ${revision}`);
	return commit;
}

function gitSucceeds(root: string, args: string[]): boolean {
	return (
		spawnProcessSync("git", ["-C", root, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).status === 0
	);
}

function readTree(root: string, commit: string): Map<string, TreeEntry> {
	const output = git(root, ["ls-tree", "-r", "-z", commit]);
	const tree = new Map<string, TreeEntry>();
	for (const record of output.split("\0")) {
		if (!record) continue;
		const separator = record.indexOf("\t");
		if (separator < 0) throw new Error(`Unexpected git ls-tree record for ${commit}`);
		const [mode, type, object] = record.slice(0, separator).split(" ");
		if (!mode || !type || !object) throw new Error(`Unexpected git ls-tree metadata for ${commit}`);
		tree.set(record.slice(separator + 1), { mode, type, object });
	}
	return tree;
}

function changedPathsWithRenames(root: string, base: string, commit: string): Set<string> {
	const tokens = git(root, ["diff", "--name-status", "-z", "--find-renames", base, commit]).split("\0");
	const paths = new Set<string>();
	for (let index = 0; index < tokens.length; ) {
		const status = tokens[index++];
		if (!status) break;
		const path = tokens[index++];
		if (!path) throw new Error(`Unexpected git diff record for ${base}..${commit}`);
		if (status.startsWith("R") || status.startsWith("C")) {
			const destination = tokens[index++];
			if (!destination) throw new Error(`Unexpected git rename record for ${base}..${commit}`);
			paths.add(path);
			paths.add(destination);
		}
	}
	return paths;
}

function sameEntry(left: TreeEntry | undefined, right: TreeEntry | undefined): boolean {
	return left?.mode === right?.mode && left?.type === right?.type && left?.object === right?.object;
}

function changeKind(
	base: TreeEntry | undefined,
	entry: TreeEntry | undefined,
): "added" | "deleted" | "modified" | "unchanged" {
	if (sameEntry(base, entry)) return "unchanged";
	if (!base) return "added";
	if (!entry) return "deleted";
	return "modified";
}

function matchesProtectedPath(path: string, patterns: string[]): boolean {
	return patterns.some((pattern) => {
		const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
		const glob = escaped.replaceAll("**", "\0").replaceAll("*", "[^/]*").replaceAll("\0", ".*");
		return new RegExp(`^${glob}$`).test(path);
	});
}

export function classifyUpstreamTrees(
	baseTree: ReadonlyMap<string, TreeEntry>,
	oursTree: ReadonlyMap<string, TreeEntry>,
	targetTree: ReadonlyMap<string, TreeEntry>,
	protectedPaths: string[],
	renamePaths: ReadonlySet<string> = new Set(),
): UpstreamFileChange[] {
	const paths = new Set([...baseTree.keys(), ...oursTree.keys(), ...targetTree.keys()]);
	const changes: UpstreamFileChange[] = [];
	for (const path of [...paths].sort()) {
		const base = baseTree.get(path);
		const ours = oursTree.get(path);
		const target = targetTree.get(path);
		const oursKind = changeKind(base, ours);
		const upstreamKind = changeKind(base, target);
		if (oursKind === "unchanged" && upstreamKind === "unchanged") continue;

		const protectedPath = matchesProtectedPath(path, protectedPaths);
		let classification: UpstreamFileClassification;
		if (renamePaths.has(path)) classification = "rename-review";
		else if (upstreamKind !== "unchanged" && protectedPath) classification = "protected-upstream-change";
		else if (oursKind !== "unchanged" && upstreamKind === "unchanged") classification = "custom-only";
		else if (oursKind === "unchanged") classification = "upstream-only";
		else if (sameEntry(ours, target)) classification = "identical-change";
		else classification = "overlap";

		changes.push({
			path,
			classification,
			ours: oursKind,
			upstream: upstreamKind,
			protected: protectedPath,
		});
	}
	return changes;
}

export function createUpstreamPlan(root: string, target?: string): UpstreamPlan {
	const dirty = git(root, ["status", "--porcelain=v1", "--untracked-files=normal"]).trim();
	if (dirty) throw new Error("Refusing to plan from a checkout with uncommitted files");

	const ownership = readOwnership(root);
	const targetRevision = target?.trim() || ownership.defaultTarget;
	const baseCommit = resolveCommit(root, ownership.upstreamBase);
	const oursCommit = resolveCommit(root, "HEAD");
	const targetCommit = resolveCommit(root, targetRevision);
	if (!gitSucceeds(root, ["merge-base", "--is-ancestor", baseCommit, targetCommit])) {
		throw new Error(`Target ${targetRevision} is not descended from the recorded upstream baseline`);
	}
	const renamePaths = new Set([
		...changedPathsWithRenames(root, baseCommit, oursCommit),
		...changedPathsWithRenames(root, baseCommit, targetCommit),
	]);
	const changes = classifyUpstreamTrees(
		readTree(root, baseCommit),
		readTree(root, oursCommit),
		readTree(root, targetCommit),
		ownership.protectedPaths,
		renamePaths,
	);
	const counts: Record<UpstreamFileClassification, number> = {
		"custom-only": 0,
		"upstream-only": 0,
		"identical-change": 0,
		"protected-upstream-change": 0,
		overlap: 0,
		"rename-review": 0,
	};
	for (const change of changes) counts[change.classification] += 1;
	return {
		root,
		base: ownership.upstreamBase,
		baseCommit,
		oursCommit,
		target: targetRevision,
		targetCommit,
		protectedPaths: ownership.protectedPaths,
		counts,
		changes,
	};
}

function printPlan(plan: UpstreamPlan, includeFiles: boolean): void {
	console.log(`Upstream base: ${plan.baseCommit}`);
	console.log(`Recode source: ${plan.oursCommit}`);
	console.log(`Target (${plan.target}): ${plan.targetCommit}`);
	console.log();
	console.log(`Custom-only files preserved: ${plan.counts["custom-only"]}`);
	console.log(`Upstream-only candidates: ${plan.counts["upstream-only"]}`);
	console.log(`Identical changes: ${plan.counts["identical-change"]}`);
	console.log(`Protected upstream changes: ${plan.counts["protected-upstream-change"]}`);
	console.log(`Overlapping changes: ${plan.counts.overlap}`);
	console.log(`Renames requiring review: ${plan.counts["rename-review"]}`);
	if (includeFiles) {
		for (const change of plan.changes) {
			console.log(`${change.classification.padEnd(27)} ${change.path}`);
		}
	}
	console.log();
	console.log("No source files were modified.");
}

function upstreamUsage(): void {
	console.log("Usage: recode upstream <status|plan> [target] [--json]");
	console.log("  status  Print classification counts without file details");
	console.log("  plan    Print every classified path");
	console.log("  target  Local Git revision to compare (default from recode/upstream-ownership.json)");
}

export function handleRepiUpstreamCommand(args: string[]): UpstreamCommandResult {
	if (args[0] !== "upstream") return { handled: false, exitCode: 0 };
	const action = args[1];
	if (!action || action === "-h" || action === "--help") {
		upstreamUsage();
		return { handled: true, exitCode: 0 };
	}
	if (action !== "status" && action !== "plan") {
		console.error(`Error: Unknown Recode upstream action: ${action}`);
		upstreamUsage();
		return { handled: true, exitCode: 1 };
	}

	const values = args.slice(2);
	const json = values.includes("--json");
	const positional = values.filter((value) => !value.startsWith("-"));
	if (positional.length > 1 || values.some((value) => value.startsWith("-") && value !== "--json")) {
		console.error("Error: Expected at most one target revision and optional --json");
		return { handled: true, exitCode: 1 };
	}

	try {
		const root = findRecodeSourceCheckout(process.cwd());
		if (!root) throw new Error("Run this command inside a Recode source checkout");
		const plan = createUpstreamPlan(root, positional[0]);
		if (json) console.log(JSON.stringify(plan, null, 2));
		else printPlan(plan, action === "plan");
		return { handled: true, exitCode: 0 };
	} catch (error) {
		console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
		console.error("No source files were modified.");
		return { handled: true, exitCode: 1 };
	}
}
