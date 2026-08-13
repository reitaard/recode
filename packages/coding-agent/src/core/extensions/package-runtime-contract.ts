import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { satisfies, validRange } from "semver";

export const EXTENSION_RUNTIME_CONTRACT_VERSION = 1;

export type ExtensionActivationScope = "session" | "process" | "service";
export type ExtensionReadinessContract = "registered" | "session-start" | "explicit";
export type ExtensionShutdownContract = "session-shutdown" | "process-stop" | "explicit";

export interface ExtensionRuntimeArtifact {
	source: string;
	entry: string;
	sourceMap?: string;
	sha256: string;
	activation: ExtensionActivationScope;
	readiness: ExtensionReadinessContract;
	shutdown: ExtensionShutdownContract;
}

export interface ExtensionRuntimeDeclarations {
	tools?: string[];
	commands?: string[];
	providers?: string[];
	permissions?: string[];
	services?: string[];
	projectTrust?: "none" | "trusted";
}

export interface ExtensionPackageRuntimeContract {
	contractVersion: typeof EXTENSION_RUNTIME_CONTRACT_VERSION;
	codingAgent: string;
	declarations?: ExtensionRuntimeDeclarations;
	extensions: ExtensionRuntimeArtifact[];
}

export interface ExtensionRuntimeContractResult {
	contract?: ExtensionPackageRuntimeContract;
	errors: string[];
}

export interface VerifiedExtensionRuntimeArtifact extends ExtensionRuntimeArtifact {
	resolvedSource: string;
	resolvedEntry: string;
	resolvedSourceMap?: string;
}

export type ExtensionPackageRuntimeStatus = "source-only" | "verified" | "invalid" | "incompatible";

export interface ExtensionPackageRuntimeInspection {
	status: ExtensionPackageRuntimeStatus;
	contract?: ExtensionPackageRuntimeContract;
	artifacts?: VerifiedExtensionRuntimeArtifact[];
	errors: string[];
}

const sha256Pattern = /^[a-f0-9]{64}$/;
const javascriptEntryPattern = /\.(?:cjs|js|mjs)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafePackagePath(value: unknown): value is string {
	if (typeof value !== "string" || !value.startsWith("./") || value.includes("\\")) {
		return false;
	}
	const segments = value.slice(2).split("/");
	return segments.length > 0 && segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
	return typeof value === "string" && choices.includes(value as T);
}

function parseDeclarationList(value: unknown, path: string, errors: string[]): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
		errors.push(`${path} must be an array of non-empty strings`);
		return undefined;
	}
	const entries = value.map((entry) => entry.trim());
	if (new Set(entries).size !== entries.length) {
		errors.push(`${path} must not contain duplicates`);
		return undefined;
	}
	return entries;
}

export function parseExtensionPackageRuntimeContract(value: unknown): ExtensionRuntimeContractResult {
	if (value === undefined) {
		return { errors: [] };
	}
	if (!isRecord(value)) {
		return { errors: ["pi.runtime must be an object"] };
	}

	const errors: string[] = [];
	if (value.contractVersion !== EXTENSION_RUNTIME_CONTRACT_VERSION) {
		errors.push(`pi.runtime.contractVersion must be ${EXTENSION_RUNTIME_CONTRACT_VERSION}`);
	}
	const codingAgent = typeof value.codingAgent === "string" ? value.codingAgent.trim() : "";
	if (codingAgent === "") {
		errors.push("pi.runtime.codingAgent must be a non-empty compatibility range");
	}
	let declarations: ExtensionRuntimeDeclarations | undefined;
	if (value.declarations !== undefined) {
		if (!isRecord(value.declarations)) {
			errors.push("pi.runtime.declarations must be an object");
		} else {
			const tools = parseDeclarationList(value.declarations.tools, "pi.runtime.declarations.tools", errors);
			const commands = parseDeclarationList(value.declarations.commands, "pi.runtime.declarations.commands", errors);
			const providers = parseDeclarationList(
				value.declarations.providers,
				"pi.runtime.declarations.providers",
				errors,
			);
			const permissions = parseDeclarationList(
				value.declarations.permissions,
				"pi.runtime.declarations.permissions",
				errors,
			);
			const services = parseDeclarationList(value.declarations.services, "pi.runtime.declarations.services", errors);
			const projectTrust = isOneOf(value.declarations.projectTrust, ["none", "trusted"] as const)
				? value.declarations.projectTrust
				: undefined;
			if (value.declarations.projectTrust !== undefined && !projectTrust) {
				errors.push("pi.runtime.declarations.projectTrust must be none or trusted");
			}
			declarations = {
				...(tools ? { tools } : {}),
				...(commands ? { commands } : {}),
				...(providers ? { providers } : {}),
				...(permissions ? { permissions } : {}),
				...(services ? { services } : {}),
				...(projectTrust ? { projectTrust } : {}),
			};
		}
	}
	if (!Array.isArray(value.extensions) || value.extensions.length === 0) {
		errors.push("pi.runtime.extensions must be a non-empty array");
		return { errors };
	}

	const extensions: ExtensionRuntimeArtifact[] = [];
	for (const [index, candidate] of value.extensions.entries()) {
		const prefix = `pi.runtime.extensions[${index}]`;
		if (!isRecord(candidate)) {
			errors.push(`${prefix} must be an object`);
			continue;
		}

		const source = isSafePackagePath(candidate.source) ? candidate.source : undefined;
		const entry =
			isSafePackagePath(candidate.entry) && javascriptEntryPattern.test(candidate.entry)
				? candidate.entry
				: undefined;
		const sourceMap =
			candidate.sourceMap === undefined || isSafePackagePath(candidate.sourceMap) ? candidate.sourceMap : null;
		const sha256 =
			typeof candidate.sha256 === "string" && sha256Pattern.test(candidate.sha256) ? candidate.sha256 : undefined;
		const activation = isOneOf(candidate.activation, ["session", "process", "service"] as const)
			? candidate.activation
			: undefined;
		const readiness = isOneOf(candidate.readiness, ["registered", "session-start", "explicit"] as const)
			? candidate.readiness
			: undefined;
		const shutdown = isOneOf(candidate.shutdown, ["session-shutdown", "process-stop", "explicit"] as const)
			? candidate.shutdown
			: undefined;

		if (!source) errors.push(`${prefix}.source must be a safe package-relative path beginning with ./`);
		if (!entry) errors.push(`${prefix}.entry must be a safe package-relative JavaScript path`);
		if (sourceMap === null) errors.push(`${prefix}.sourceMap must be a safe package-relative path`);
		if (!sha256) errors.push(`${prefix}.sha256 must be a lowercase 64-character SHA-256 hex digest`);
		if (!activation) errors.push(`${prefix}.activation must be session, process, or service`);
		if (!readiness) errors.push(`${prefix}.readiness must be registered, session-start, or explicit`);
		if (!shutdown) errors.push(`${prefix}.shutdown must be session-shutdown, process-stop, or explicit`);
		if (!source || !entry || sourceMap === null || !sha256 || !activation || !readiness || !shutdown) {
			continue;
		}
		extensions.push({
			source,
			entry,
			...(sourceMap === undefined ? {} : { sourceMap }),
			sha256,
			activation,
			readiness,
			shutdown,
		});
	}

	if (errors.length > 0) {
		return { errors };
	}
	return {
		contract: {
			contractVersion: EXTENSION_RUNTIME_CONTRACT_VERSION,
			codingAgent,
			...(declarations ? { declarations } : {}),
			extensions,
		},
		errors: [],
	};
}

export function inspectExtensionPackageRuntime(
	packageJsonPath: string,
	codingAgentVersion: string,
): ExtensionPackageRuntimeInspection {
	if (!existsSync(packageJsonPath)) {
		return { status: "source-only", errors: [] };
	}
	let packageJson: unknown;
	try {
		packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	} catch (error) {
		return {
			status: "invalid",
			errors: [`Cannot read package manifest: ${error instanceof Error ? error.message : String(error)}`],
		};
	}
	if (!isRecord(packageJson) || !isRecord(packageJson.pi)) {
		return { status: "source-only", errors: [] };
	}

	const parsed = parseExtensionPackageRuntimeContract(packageJson.pi.runtime);
	if (!parsed.contract) {
		return parsed.errors.length === 0
			? { status: "source-only", errors: [] }
			: { status: "invalid", errors: parsed.errors };
	}
	const contract = parsed.contract;
	if (!validRange(contract.codingAgent)) {
		return {
			status: "invalid",
			contract,
			errors: ["pi.runtime.codingAgent must be a valid semantic-version range"],
		};
	}
	if (!satisfies(codingAgentVersion, contract.codingAgent, { includePrerelease: true })) {
		return {
			status: "incompatible",
			contract,
			errors: [
				`Extension runtime requires Recode ${contract.codingAgent}, current version is ${codingAgentVersion}`,
			],
		};
	}

	const packageRoot = dirname(packageJsonPath);
	const errors: string[] = [];
	const artifacts: VerifiedExtensionRuntimeArtifact[] = [];
	const sources = new Set<string>();
	for (const [index, artifact] of contract.extensions.entries()) {
		const prefix = `pi.runtime.extensions[${index}]`;
		if (sources.has(artifact.source)) {
			errors.push(`${prefix}.source duplicates ${artifact.source}`);
			continue;
		}
		sources.add(artifact.source);
		const resolvedSource = resolve(packageRoot, artifact.source);
		const resolvedEntry = resolve(packageRoot, artifact.entry);
		const resolvedSourceMap = artifact.sourceMap ? resolve(packageRoot, artifact.sourceMap) : undefined;
		if (!existsSync(resolvedSource)) errors.push(`${prefix}.source does not exist`);
		if (!existsSync(resolvedEntry)) errors.push(`${prefix}.entry does not exist`);
		if (resolvedSourceMap && !existsSync(resolvedSourceMap)) errors.push(`${prefix}.sourceMap does not exist`);
		if (existsSync(resolvedEntry)) {
			const actualHash = createHash("sha256").update(readFileSync(resolvedEntry)).digest("hex");
			if (actualHash !== artifact.sha256) {
				errors.push(`${prefix}.entry SHA-256 does not match the manifest`);
			}
		}
		artifacts.push({
			...artifact,
			resolvedSource,
			resolvedEntry,
			...(resolvedSourceMap ? { resolvedSourceMap } : {}),
		});
	}

	return errors.length > 0
		? { status: "invalid", contract, errors }
		: { status: "verified", contract, artifacts, errors: [] };
}
