import { compare, valid } from "semver";
import { getPiUserAgent } from "./pi-user-agent.ts";

const DEFAULT_VERSION_CHECK_TIMEOUT_MS = 10000;

function validateUpdateEndpoint(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const url = new URL(value);
	if (url.protocol !== "https:") throw new Error("Recode update endpoint must use HTTPS");
	return url.toString();
}

export interface LatestPiRelease {
	version: string;
	packageName?: string;
	note?: string;
}

export function comparePackageVersions(leftVersion: string, rightVersion: string): number | undefined {
	const left = valid(leftVersion.trim());
	const right = valid(rightVersion.trim());
	if (!left || !right) {
		return undefined;
	}
	return compare(left, right);
}

export function isNewerPackageVersion(candidateVersion: string, currentVersion: string): boolean {
	const comparison = comparePackageVersions(candidateVersion, currentVersion);
	if (comparison !== undefined) {
		return comparison > 0;
	}
	return candidateVersion.trim() !== currentVersion.trim();
}

export async function getLatestPiRelease(
	currentVersion: string,
	options: { endpoint?: string; timeoutMs?: number } = {},
): Promise<LatestPiRelease | undefined> {
	if (process.env.PI_SKIP_VERSION_CHECK || process.env.PI_OFFLINE) return undefined;
	const updateEndpoint = validateUpdateEndpoint(options.endpoint);
	if (!updateEndpoint) return undefined;

	const response = await fetch(updateEndpoint, {
		headers: {
			"User-Agent": getPiUserAgent(currentVersion),
			accept: "application/json",
		},
		signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_VERSION_CHECK_TIMEOUT_MS),
	});
	if (!response.ok) return undefined;

	const data = (await response.json()) as {
		packageName?: unknown;
		version?: unknown;
		note?: unknown;
	};
	if (typeof data.version !== "string" || !data.version.trim()) {
		return undefined;
	}
	const packageName =
		typeof data.packageName === "string" && data.packageName.trim() ? data.packageName.trim() : undefined;
	const note = typeof data.note === "string" && data.note.trim() ? data.note.trim() : undefined;
	return {
		version: data.version.trim(),
		packageName,
		...(note ? { note } : {}),
	};
}

export async function getLatestPiVersion(
	currentVersion: string,
	options: { endpoint?: string; timeoutMs?: number } = {},
): Promise<string | undefined> {
	return (await getLatestPiRelease(currentVersion, options))?.version;
}

export async function checkForNewPiVersion(
	currentVersion: string,
	expectedPackageName?: string,
	options: { endpoint?: string; timeoutMs?: number } = {},
): Promise<LatestPiRelease | undefined> {
	try {
		const latestRelease = await getLatestPiRelease(currentVersion, options);
		if (latestRelease?.packageName && expectedPackageName && latestRelease.packageName !== expectedPackageName) {
			return undefined;
		}
		if (latestRelease && isNewerPackageVersion(latestRelease.version, currentVersion)) {
			return latestRelease;
		}
		return undefined;
	} catch {
		return undefined;
	}
}
