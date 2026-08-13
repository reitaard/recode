import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const CREDENTIAL_PATH_PATTERN =
	/(?:^|[\\/])\.(?:ssh|aws|azure|kube|gnupg)(?:[\\/]|$)|(?:^|[\\/])\.config[\\/](?:gcloud|gh)(?:[\\/]|$)/i;
const DEVICE_WRITE_PATTERN =
	/\b(?:mkfs(?:\.[a-z0-9]+)?|diskpart)\b|\bdd\b[^\n;&|]*\bof\s*=\s*["']?\/dev\/|(?:^|[;&|]\s*)format(?:\.com)?\s+[a-z]:/i;
const FORK_BOMB_PATTERN = /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/;

function normalizeCommand(command: string, home: string): string {
	return command
		.replace(/\$\{HOME\}|\$HOME|%USERPROFILE%|%HOME%/gi, home)
		.replace(/(^|\s)~(?=\s|[\\/]|$)/g, `$1${home}`)
		.replace(/["'`]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeTarget(target: string): string {
	const cleaned = target.replace(/[;,]+$/, "").toLowerCase();
	if (/^\/+\*?$/.test(cleaned)) return cleaned.includes("*") ? "/*" : "/";
	if (/^[a-z]:[\\/]*$/i.test(cleaned)) return cleaned.slice(0, 2);
	return cleaned.replace(/[\\/]+$/, "");
}

function isCatastrophicTarget(target: string, home: string, cwd: string): boolean {
	const normalized = normalizeTarget(target);
	const normalizedHome = normalizeTarget(resolve(home));
	const normalizedHomeParent = normalizeTarget(dirname(resolve(home)));
	if (!normalized) return false;
	if (CREDENTIAL_PATH_PATTERN.test(normalized)) return true;
	const resolved = normalizeTarget(resolve(cwd, normalized));
	if (
		normalized === "/" ||
		normalized === "/*" ||
		/^[a-z]:$/i.test(normalized) ||
		resolved === "/" ||
		/^[a-z]:$/i.test(resolved) ||
		resolved === "/home" ||
		resolved === "/users" ||
		resolved === normalizedHome ||
		resolved === normalizedHomeParent
	)
		return true;
	return CREDENTIAL_PATH_PATTERN.test(resolved);
}

function segmentTargets(segment: string): string[] {
	return segment
		.split(/\s+/)
		.slice(1)
		.filter((token) => token && !token.startsWith("-") && !token.startsWith("/q") && !token.startsWith("/s"));
}

/** Absolute-deny gate for catastrophic host-wide shell commands. This is not a sandbox. */
export function getCatastrophicCommandReason(
	command: string,
	options: { homeDir?: string; cwd?: string } = {},
): string | undefined {
	const home = options.homeDir ?? homedir();
	const cwd = options.cwd ?? process.cwd();
	const normalized = normalizeCommand(command, home);
	if (!normalized) return undefined;
	if (FORK_BOMB_PATTERN.test(normalized)) return "Blocked a process-exhaustion fork bomb";
	if (DEVICE_WRITE_PATTERN.test(normalized)) return "Blocked a command that writes directly to a disk or device";

	for (const segment of normalized.split(/(?:&&|\|\||[;\n])/)) {
		const trimmed = segment.trim();
		if (!trimmed) continue;
		const lower = trimmed.toLowerCase();
		const recursiveDelete =
			/\b(?:rm)\b/.test(lower) && /(?:^|\s)(?:--recursive|-(?:[a-z]*r[a-z]*f?|[a-z]*f[a-z]*r))(?:\s|$)/i.test(lower);
		const windowsDelete = /\b(?:rmdir|rd|del)\b/i.test(lower) && /(?:^|\s)\/s(?:\s|$)/i.test(lower);
		const powershellDelete = /\bremove-item\b/i.test(lower) && /(?:^|\s)-(?:recurse|r)(?:\s|$)/i.test(lower);
		const findDelete = /\bfind\b/i.test(lower) && /(?:^|\s)-delete(?:\s|$)/i.test(lower);
		const permissionDestroy = /\b(?:chmod|chown)\b/i.test(lower) && /(?:^|\s)-(?:[a-z]*r)(?:\s|$)/i.test(lower);
		if (!recursiveDelete && !windowsDelete && !powershellDelete && !findDelete && !permissionDestroy) continue;
		if (segmentTargets(trimmed).some((target) => isCatastrophicTarget(target, home, cwd))) {
			return "Blocked a recursive destructive command targeting a filesystem root, home directory, or credential store";
		}
	}
	return undefined;
}
