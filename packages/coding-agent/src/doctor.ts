import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	classifyCurrentInstallation,
	getAgentDir,
	getPackageDir,
	getTuiDiagnosticsLogPath,
	getTuiRawLogDirectory,
	type InstallationClassification,
	VERSION,
} from "./config.ts";
import { type AuthStatus, AuthStorage } from "./core/auth-storage.ts";
import { inspectExtensionPackageRuntime } from "./core/extensions/package-runtime-contract.ts";
import { type MaestroHealthSnapshot, queryMaestroHealth } from "./core/maestro-status.ts";
import { DefaultPackageManager } from "./core/package-manager.ts";
import { type LspSettings, type PackageSource, SettingsManager } from "./core/settings-manager.ts";
import { probeRecodeOpenProvider, type RecodeOpenProviderProbe } from "./recode-open-provider.ts";

export type DoctorCheckStatus = "pass" | "warn" | "fail" | "info";
export type DoctorVerdict = "healthy" | "attention" | "failed";

export interface DoctorCheck {
	id: string;
	label: string;
	status: DoctorCheckStatus;
	summary: string;
	next?: string;
}

export interface DoctorSection {
	id: string;
	title: string;
	checks: DoctorCheck[];
}

export interface DoctorReport {
	schemaVersion: 1;
	createdAt: string;
	verdict: DoctorVerdict;
	sections: DoctorSection[];
}

interface ReleaseSnapshot {
	present: boolean;
	valid: boolean;
	version?: string;
	sourceCommit?: string;
}

interface SettingsSnapshot {
	valid: boolean;
	defaultProvider?: string;
	defaultModel?: string;
	authRequired: boolean;
	packages: string[];
	lsp: Required<Pick<LspSettings, "enabled" | "lspmux" | "projectOnly">> & Pick<LspSettings, "servers">;
}

interface IntegrationSnapshot {
	configuredPackages: number;
	installedPackages: number;
	missingPackages: number;
	verifiedPackages: number;
	invalidPackages: number;
	sourceOnlyPackages: number;
	extensions: number;
	tools: number;
	providers: number;
	services: number;
	mcpServerCount: number;
	mcpConfigErrors: number;
}

interface MemorySnapshot {
	indexPresent: boolean;
	indexBytes: number;
	canonicalMemoryPresent: boolean;
}

interface TuiDiagnosticsSnapshot {
	diagnosticsPath: string;
	diagnosticsPresent: boolean;
	diagnosticsBytes: number;
	eventCount: number;
	invalidEventCount: number;
	crashCount: number;
	unhandledRejectionCount: number;
	overflowCount: number;
	slowRenderCount: number;
	rawLogDirectory: string;
	rawCaptureFiles: number;
	rawCaptureBytes: number;
}

export interface DoctorSnapshot {
	version: string;
	packageSourceCommit?: string;
	release: ReleaseSnapshot;
	installation: InstallationClassification;
	settings: SettingsSnapshot;
	auth: AuthStatus;
	providerProbe?: RecodeOpenProviderProbe;
	maestro?: MaestroHealthSnapshot;
	maestroError?: boolean;
	integrations: IntegrationSnapshot;
	memory: MemorySnapshot;
	tuiDiagnostics?: TuiDiagnosticsSnapshot;
}

interface ReleaseManifestShape {
	release?: { version?: unknown };
	source?: { commit?: unknown };
}

interface PackageMetadataShape {
	recode?: { sourceCommit?: unknown };
}

interface ExtensionPackageShape {
	pi?: {
		extensions?: unknown;
	};
}

function packageSourceLabel(source: PackageSource): string {
	return typeof source === "string" ? source : source.source;
}

function readReleaseSnapshot(packageDir: string): ReleaseSnapshot {
	const path = join(packageDir, "dist", "recode-release.json");
	if (!existsSync(path)) return { present: false, valid: false };
	try {
		const manifest = JSON.parse(readFileSync(path, "utf8")) as ReleaseManifestShape;
		const version = typeof manifest.release?.version === "string" ? manifest.release.version : undefined;
		const sourceCommit = typeof manifest.source?.commit === "string" ? manifest.source.commit : undefined;
		return {
			present: true,
			valid: Boolean(version && sourceCommit && /^[0-9a-f]{40}$/.test(sourceCommit)),
			version,
			sourceCommit,
		};
	} catch {
		return { present: true, valid: false };
	}
}

function readPackageSourceCommit(packageDir: string): string | undefined {
	try {
		const metadata = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as PackageMetadataShape;
		return typeof metadata.recode?.sourceCommit === "string" ? metadata.recode.sourceCommit : undefined;
	} catch {
		return undefined;
	}
}

function discoverIntegrations(
	packageManager: DefaultPackageManager,
	cwd: string,
	agentDir: string,
): IntegrationSnapshot {
	const mcp = readMcpConfiguration(cwd, agentDir);
	const result: IntegrationSnapshot = {
		configuredPackages: 0,
		installedPackages: 0,
		missingPackages: 0,
		verifiedPackages: 0,
		invalidPackages: 0,
		sourceOnlyPackages: 0,
		extensions: 0,
		tools: 0,
		providers: 0,
		services: 0,
		mcpServerCount: mcp.servers,
		mcpConfigErrors: mcp.errors,
	};
	for (const entry of packageManager.listConfiguredPackages()) {
		result.configuredPackages++;
		if (!entry.installedPath) {
			result.missingPackages++;
			continue;
		}
		result.installedPackages++;
		const packageJsonPath = join(entry.installedPath, "package.json");
		const inspection = inspectExtensionPackageRuntime(packageJsonPath, VERSION);
		if (inspection.status === "verified") result.verifiedPackages++;
		else if (inspection.status === "source-only") result.sourceOnlyPackages++;
		else result.invalidPackages++;
		const declarations = inspection.contract?.declarations;
		result.tools += declarations?.tools?.length ?? 0;
		result.providers += declarations?.providers?.length ?? 0;
		result.services += declarations?.services?.length ?? 0;
		result.extensions += inspection.contract?.extensions.length ?? 0;
		if (inspection.contract || !existsSync(packageJsonPath)) continue;
		try {
			const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as ExtensionPackageShape;
			result.extensions += Array.isArray(manifest.pi?.extensions) ? manifest.pi.extensions.length : 0;
		} catch {
			result.invalidPackages++;
		}
	}
	return result;
}

function readMcpConfiguration(cwd: string, agentDir: string): { servers: number; errors: number } {
	let servers = 0;
	let errors = 0;
	for (const path of [join(agentDir, "mcp.json"), join(cwd, ".pi", "mcp.json"), join(cwd, ".mcp.json")]) {
		if (!existsSync(path)) continue;
		try {
			const value = JSON.parse(readFileSync(path, "utf8")) as {
				mcpServers?: unknown;
				"mcp-servers"?: unknown;
				servers?: unknown;
			};
			const configuredServers = value.mcpServers ?? value["mcp-servers"] ?? value.servers;
			if (typeof configuredServers === "object" && configuredServers !== null && !Array.isArray(configuredServers)) {
				servers += Object.keys(configuredServers).length;
			} else {
				errors++;
			}
		} catch {
			errors++;
		}
	}
	return { servers, errors };
}

function readFileSize(path: string): number {
	try {
		return statSync(path).size;
	} catch {
		return 0;
	}
}

function readTuiDiagnosticsSnapshot(): TuiDiagnosticsSnapshot {
	const diagnosticsPath = getTuiDiagnosticsLogPath();
	const rawLogDirectory = getTuiRawLogDirectory();
	let eventCount = 0;
	let invalidEventCount = 0;
	let crashCount = 0;
	let unhandledRejectionCount = 0;
	let overflowCount = 0;
	let slowRenderCount = 0;
	if (existsSync(diagnosticsPath)) {
		try {
			for (const line of readFileSync(diagnosticsPath, "utf8").split("\n")) {
				if (!line.trim()) continue;
				try {
					const event = JSON.parse(line) as Record<string, unknown>;
					if (typeof event.kind !== "string") {
						invalidEventCount++;
						continue;
					}
					eventCount++;
					switch (event.kind) {
						case "crash":
							crashCount++;
							if (event.source === "unhandledRejection") unhandledRejectionCount++;
							break;
						case "render-overflow":
							overflowCount++;
							break;
						case "slow-render":
							slowRenderCount++;
							break;
					}
				} catch {
					invalidEventCount++;
				}
			}
		} catch {
			invalidEventCount++;
		}
	}

	let rawCaptureFiles = 0;
	let rawCaptureBytes = 0;
	const rawLocations = new Set<string>([rawLogDirectory]);
	const configuredRawLog = process.env.PI_TUI_WRITE_LOG;
	if (configuredRawLog) rawLocations.add(configuredRawLog);
	for (const location of rawLocations) {
		try {
			const locationStat = statSync(location);
			if (locationStat.isFile()) {
				rawCaptureFiles++;
				rawCaptureBytes += locationStat.size;
				continue;
			}
			if (!locationStat.isDirectory()) continue;
			for (const entry of readdirSync(location, { withFileTypes: true })) {
				if (!entry.isFile() || !entry.name.startsWith("tui-")) continue;
				const entryPath = join(location, entry.name);
				rawCaptureFiles++;
				rawCaptureBytes += readFileSize(entryPath);
			}
		} catch {
			// A missing or inaccessible capture location is reported by its zero counts.
		}
	}
	return {
		diagnosticsPath,
		diagnosticsPresent: existsSync(diagnosticsPath),
		diagnosticsBytes: readFileSize(diagnosticsPath),
		eventCount,
		invalidEventCount,
		crashCount,
		unhandledRejectionCount,
		overflowCount,
		slowRenderCount,
		rawLogDirectory,
		rawCaptureFiles,
		rawCaptureBytes,
	};
}

export async function collectDoctorSnapshot(cwd = process.cwd()): Promise<DoctorSnapshot> {
	const packageDir = getPackageDir();
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
	const settingsErrors = settingsManager.drainErrors();
	const packages = settingsManager.getPackages().map(packageSourceLabel);
	const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
	const defaultProvider = settingsManager.getDefaultProvider();
	const auth = defaultProvider
		? AuthStorage.create(join(agentDir, "auth.json")).getAuthStatus(defaultProvider)
		: { configured: false };
	let maestro: MaestroHealthSnapshot | undefined;
	let maestroError = false;
	try {
		maestro = await queryMaestroHealth(1_500);
		if (!maestro) maestroError = true;
	} catch {
		maestroError = true;
	}
	const memoryIndexPath = join(agentDir, "recode-memory.sqlite");
	return {
		version: VERSION,
		packageSourceCommit: readPackageSourceCommit(packageDir),
		release: readReleaseSnapshot(packageDir),
		installation: classifyCurrentInstallation(settingsManager.getNpmCommand()),
		settings: {
			valid: settingsErrors.length === 0,
			defaultProvider,
			defaultModel: settingsManager.getDefaultModel(),
			authRequired: defaultProvider !== "openai-oauth" && defaultProvider !== "open-provider",
			packages,
			lsp: settingsManager.getLspSettings(),
		},
		auth,
		providerProbe:
			defaultProvider === "open-provider"
				? await probeRecodeOpenProvider(settingsManager.getDefaultModel())
				: undefined,
		maestro,
		maestroError,
		integrations: discoverIntegrations(packageManager, cwd, agentDir),
		memory: {
			indexPresent: existsSync(memoryIndexPath),
			indexBytes: readFileSize(memoryIndexPath),
			canonicalMemoryPresent: existsSync(join(cwd, ".pi", "memory", "MEMORY.md")),
		},
		tuiDiagnostics: readTuiDiagnosticsSnapshot(),
	};
}

export function createDoctorReport(snapshot: DoctorSnapshot, now = new Date()): DoctorReport {
	const identityChecks: DoctorCheck[] = [];
	if (!snapshot.release.present) {
		identityChecks.push({
			id: "release-manifest",
			label: "Release identity",
			status: "warn",
			summary: "No embedded release manifest was found; this may be a source checkout.",
		});
	} else if (!snapshot.release.valid) {
		identityChecks.push({
			id: "release-manifest",
			label: "Release identity",
			status: "fail",
			summary: "The embedded release manifest is malformed.",
			next: "Reinstall Recode from a verified artifact.",
		});
	} else if (snapshot.installation.kind === "linked-source" && !snapshot.packageSourceCommit) {
		identityChecks.push({
			id: "release-manifest",
			label: "Release identity",
			status: "info",
			summary: "Source checkout detected; embedded artifact identity is not used as checkout identity.",
		});
	} else if (
		snapshot.release.version !== snapshot.version ||
		snapshot.release.sourceCommit !== snapshot.packageSourceCommit
	) {
		identityChecks.push({
			id: "release-manifest",
			label: "Release identity",
			status: "fail",
			summary: "Package metadata and embedded release identity do not match.",
			next: "Reinstall the exact verified Recode artifact.",
		});
	} else {
		identityChecks.push({
			id: "release-manifest",
			label: "Release identity",
			status: "pass",
			summary: `Recode ${snapshot.version} with verified embedded source identity.`,
		});
	}
	identityChecks.push({
		id: "installation",
		label: "Installation",
		status: snapshot.installation.kind === "unsupported" ? "warn" : "pass",
		summary: `${snapshot.installation.kind} via ${snapshot.installation.installMethod}: ${snapshot.installation.reason}.`,
		next:
			snapshot.installation.kind === "unsupported"
				? "Install Recode through a verified package, source checkout, or compiled artifact."
				: undefined,
	});

	const configurationChecks: DoctorCheck[] = [
		{
			id: "settings",
			label: "Settings",
			status: snapshot.settings.valid ? "pass" : "fail",
			summary: snapshot.settings.valid
				? "Global settings parsed successfully."
				: "One or more settings files are invalid.",
			next: snapshot.settings.valid
				? undefined
				: "Correct the malformed settings JSON and run `recode doctor` again.",
		},
	];
	if (!snapshot.settings.defaultProvider || !snapshot.settings.defaultModel) {
		configurationChecks.push({
			id: "default-model",
			label: "Default model",
			status: "warn",
			summary: "A complete default provider/model pair is not configured.",
			next: "Select a provider and model in Recode settings.",
		});
	} else {
		configurationChecks.push({
			id: "default-model",
			label: "Default model",
			status: "pass",
			summary: `${snapshot.settings.defaultProvider}/${snapshot.settings.defaultModel} is selected.`,
		});
	}
	configurationChecks.push({
		id: "provider-auth",
		label: "Provider auth",
		status: !snapshot.settings.authRequired || snapshot.auth.configured || snapshot.auth.source ? "pass" : "warn",
		summary: !snapshot.settings.authRequired
			? "The selected local provider does not require a Recode credential."
			: snapshot.auth.source
				? `Credential source is ${snapshot.auth.source}${snapshot.auth.label ? ` (${snapshot.auth.label})` : ""}; values were not read.`
				: "No credential source was detected for the selected provider.",
		next:
			!snapshot.settings.authRequired || snapshot.auth.configured || snapshot.auth.source
				? undefined
				: "Run the provider login flow or configure its environment key.",
	});
	if (snapshot.providerProbe) {
		const probe = snapshot.providerProbe;
		const reachable = probe.status === "reachable";
		const selectedPresent = probe.selectedModelPresent !== false;
		const summaries: Record<RecodeOpenProviderProbe["status"], string> = {
			"not-configured": "Open Provider has no valid endpoint configuration.",
			reachable: selectedPresent
				? `Open Provider catalogue is reachable with ${probe.modelCount ?? 0} model(s).`
				: "Open Provider is reachable, but the selected model is absent from its catalogue.",
			timeout: "Open Provider did not respond before the bounded timeout.",
			dns: "Open Provider hostname could not be resolved.",
			refused: "Open Provider endpoint refused the connection.",
			tls: "Open Provider TLS validation failed.",
			network: "Open Provider failed with an unclassified network error.",
			http:
				probe.httpStatus === 401 || probe.httpStatus === 403
					? `Open Provider rejected authentication (HTTP ${probe.httpStatus}).`
					: `Open Provider returned HTTP ${probe.httpStatus ?? "error"}.`,
			empty: "Open Provider is reachable but returned no models.",
		};
		configurationChecks.push({
			id: "provider-connectivity",
			label: "Provider connectivity",
			status: reachable && selectedPresent ? "pass" : "fail",
			summary: summaries[probe.status],
			next:
				reachable && !selectedPresent
					? "Select a model returned by Open Provider."
					: reachable
						? undefined
						: "Restore access to the configured Open Provider endpoint, then rerun `recode doctor`.",
		});
	}

	const integrationChecks: DoctorCheck[] = [
		{
			id: "packages",
			label: "Packages",
			status:
				snapshot.integrations.missingPackages > 0 || snapshot.integrations.invalidPackages > 0
					? "fail"
					: snapshot.integrations.configuredPackages > 0
						? "pass"
						: "info",
			summary:
				snapshot.integrations.configuredPackages === 0
					? "No extension packages are configured."
					: `${snapshot.integrations.installedPackages}/${snapshot.integrations.configuredPackages} package(s) installed; ${snapshot.integrations.verifiedPackages} verified runtime contract(s), ${snapshot.integrations.sourceOnlyPackages} source-only package(s), ${snapshot.integrations.invalidPackages} rejected.`,
			next:
				snapshot.integrations.missingPackages > 0 || snapshot.integrations.invalidPackages > 0
					? "Run `recode list` and reinstall or update the missing/rejected package."
					: undefined,
		},
		{
			id: "extension-capabilities",
			label: "Extension capabilities",
			status: snapshot.integrations.extensions > 0 ? "pass" : "info",
			summary: `${snapshot.integrations.extensions} extension(s) declare ${snapshot.integrations.tools} tool(s), ${snapshot.integrations.providers} provider(s), and ${snapshot.integrations.services} service(s). No extension code was executed.`,
		},
		{
			id: "connected-services",
			label: "Connected services",
			status:
				snapshot.integrations.mcpConfigErrors > 0
					? "fail"
					: snapshot.integrations.mcpServerCount > 0 || snapshot.integrations.services > 0
						? "pass"
						: "info",
			summary: `${snapshot.integrations.services} extension service declaration(s) and ${snapshot.integrations.mcpServerCount} MCP server definition(s) discovered; ${snapshot.integrations.mcpConfigErrors} configuration error(s). No service was started.`,
			next:
				snapshot.integrations.mcpConfigErrors > 0
					? "Correct the invalid MCP configuration and rerun `recode doctor`."
					: undefined,
		},
	];

	const runtimeChecks: DoctorCheck[] = [];
	if (snapshot.maestro?.ready) {
		const divergent = snapshot.maestro.diagnostic?.startsWith("STATE_DIVERGENCE:") === true;
		runtimeChecks.push({
			id: "maestro",
			label: "Maestro",
			status: divergent ? "fail" : snapshot.maestro.state === "degraded" ? "warn" : "pass",
			summary: divergent
				? "Maestro canonical lifecycle sources disagree; state is not trusted."
				: `Service is ${snapshot.maestro.state}, accepting requests, with ${snapshot.maestro.liveInstances} live session(s).`,
			next:
				divergent || snapshot.maestro.state === "degraded"
					? "Run `recode maestro diagnose` for the redacted service bundle."
					: undefined,
		});
	} else {
		runtimeChecks.push({
			id: "maestro",
			label: "Maestro",
			status: "warn",
			summary: snapshot.maestroError
				? "Service is unavailable."
				: `Service is ${snapshot.maestro?.state ?? "unknown"}.`,
			next: "Run `recode maestro service start`, then rerun `recode doctor`.",
		});
	}
	if (snapshot.tuiDiagnostics) {
		const tui = snapshot.tuiDiagnostics;
		const hasRenderFailure = tui.crashCount > 0 || tui.overflowCount > 0;
		runtimeChecks.push({
			id: "tui-diagnostics",
			label: "TUI diagnostics",
			status: hasRenderFailure ? "warn" : tui.diagnosticsPresent || tui.rawCaptureFiles > 0 ? "pass" : "info",
			summary: hasRenderFailure
				? `${tui.crashCount} crash event(s), ${tui.overflowCount} render overflow(s), and ${tui.slowRenderCount} slow render(s) recorded.`
				: `${tui.slowRenderCount} slow render(s) recorded; ${tui.rawCaptureFiles} complete ANSI capture file(s) available (${tui.rawCaptureBytes} bytes).`,
			next: hasRenderFailure ? `Inspect ${tui.diagnosticsPath} and ${tui.rawLogDirectory}.` : undefined,
		});
	}
	runtimeChecks.push({
		id: "memory",
		label: "Memory index",
		status: snapshot.memory.indexPresent && snapshot.memory.indexBytes > 0 ? "pass" : "warn",
		summary:
			snapshot.memory.indexPresent && snapshot.memory.indexBytes > 0
				? `Local memory index is present${snapshot.memory.canonicalMemoryPresent ? " with project memory authority" : ""}.`
				: "Local memory index is absent or empty.",
		next:
			snapshot.memory.indexPresent && snapshot.memory.indexBytes > 0
				? undefined
				: "Start Recode once from the intended project to initialize memory indexing.",
	});
	runtimeChecks.push({
		id: "lsp",
		label: "LSP",
		status: snapshot.settings.lsp.enabled ? "pass" : "info",
		summary: snapshot.settings.lsp.enabled
			? `Enabled (${snapshot.settings.lsp.projectOnly ? "project-only" : "workspace"}, ${snapshot.settings.lsp.lspmux ? "lspmux" : "direct"}); ${Object.keys(snapshot.settings.lsp.servers ?? {}).length} server override(s).`
			: "Disabled in settings.",
	});

	const sections: DoctorSection[] = [
		{ id: "identity", title: "Identity and installation", checks: identityChecks },
		{ id: "configuration", title: "Configuration and provider", checks: configurationChecks },
		{ id: "integrations", title: "Integrations", checks: integrationChecks },
		{ id: "runtime", title: "Runtime services", checks: runtimeChecks },
	];
	const checks = sections.flatMap((section) => section.checks);
	const verdict: DoctorVerdict = checks.some((check) => check.status === "fail")
		? "failed"
		: checks.some((check) => check.status === "warn")
			? "attention"
			: "healthy";
	return { schemaVersion: 1, createdAt: now.toISOString(), verdict, sections };
}

export function renderDoctorReport(report: DoctorReport): string {
	const tokens: Record<DoctorCheckStatus, string> = {
		pass: "PASS",
		warn: "WARN",
		fail: "FAIL",
		info: "INFO",
	};
	const primary = report.sections.flatMap((section) => section.checks).find((check) => check.status === "fail");
	const lines = ["Recode Doctor"];
	if (primary) {
		lines.push("", `Problem: ${primary.summary}`);
		if (primary.next) lines.push(`Fix: ${primary.next}`);
	}
	lines.push("");
	for (const section of report.sections) {
		lines.push(section.title);
		for (const check of section.checks) {
			lines.push(`  [${tokens[check.status]}] ${check.label}: ${check.summary}`);
			if (check.next) lines.push(`         Next: ${check.next}`);
		}
		lines.push("");
	}
	lines.push(`Verdict: ${report.verdict}`);
	return lines.join("\n");
}

function printDoctorHelp(): void {
	console.log(
		`Recode Doctor\n\nUsage:\n  recode doctor\n  recode doctor --json\n\nRuns bounded, read-only diagnostics. It does not start Aizen, extensions, browsers, MCP servers, or paid model requests.`,
	);
}

export async function runDoctor(args: string[]): Promise<number> {
	if (args.includes("--help") || args.includes("-h")) {
		printDoctorHelp();
		return 0;
	}
	const unknown = args.filter((arg) => arg !== "--json");
	if (unknown.length > 0) {
		console.error(`Unknown doctor option: ${unknown[0]}`);
		printDoctorHelp();
		return 2;
	}
	const report = createDoctorReport(await collectDoctorSnapshot());
	console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : renderDoctorReport(report));
	return report.verdict === "failed" ? 1 : 0;
}
