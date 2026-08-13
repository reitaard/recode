import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { resolveToCwd } from "../tools/path-utils.ts";

const WORKSPACE_FILE_TOOLS = new Set(["read", "grep", "find", "ls"]);
const OUTSIDE_WORKSPACE_REASON = "Delegated workers may only access paths inside the active workspace";

function isInsidePath(root: string, candidate: string): boolean {
	const rel = relative(root, candidate);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function realpathOrResolved(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch {
		return resolve(path);
	}
}

/**
 * Block delegated read-only file tools from escaping cwd through absolute paths,
 * parent traversal, tilde expansion, or an existing symlink target.
 */
export function createWorkspaceToolCallGuard(
	cwd: string,
): (event: {
	toolName: string;
	input: Record<string, unknown>;
}) => Promise<{ block: true; reason: string } | undefined> {
	const workspaceRoot = resolve(cwd);
	const canonicalRootPromise = realpathOrResolved(workspaceRoot);

	return async (event) => {
		if (!WORKSPACE_FILE_TOOLS.has(event.toolName)) return undefined;
		const rawPath = event.input.path;
		if (rawPath === undefined) return undefined;
		if (typeof rawPath !== "string") return { block: true, reason: OUTSIDE_WORKSPACE_REASON };

		const requestedPath = resolveToCwd(rawPath || ".", workspaceRoot);
		if (!isInsidePath(workspaceRoot, requestedPath)) {
			return { block: true, reason: OUTSIDE_WORKSPACE_REASON };
		}

		const [canonicalRoot, canonicalRequested] = await Promise.all([
			canonicalRootPromise,
			realpathOrResolved(requestedPath),
		]);
		if (!isInsidePath(canonicalRoot, canonicalRequested)) {
			return { block: true, reason: OUTSIDE_WORKSPACE_REASON };
		}
		return undefined;
	};
}
