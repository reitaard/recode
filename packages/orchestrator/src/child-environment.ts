import type { WorkspaceAccessMode } from "./types.ts";

const SYSTEM_ENVIRONMENT = new Set([
	"APPDATA",
	"COLORTERM",
	"COMSPEC",
	"DISPLAY",
	"EDITOR",
	"HOME",
	"HOMEDRIVE",
	"HOMEPATH",
	"LANG",
	"LOCALAPPDATA",
	"PATH",
	"PATHEXT",
	"PROGRAMDATA",
	"PROGRAMFILES",
	"PROGRAMFILES(X86)",
	"PROGRAMW6432",
	"PSMODULEPATH",
	"PUBLIC",
	"SHELL",
	"SSL_CERT_DIR",
	"SSL_CERT_FILE",
	"SYSTEMDRIVE",
	"SYSTEMROOT",
	"TEMP",
	"TERM",
	"TERM_PROGRAM",
	"TERM_PROGRAM_VERSION",
	"TMP",
	"TMPDIR",
	"USER",
	"USERDOMAIN",
	"USERNAME",
	"USERPROFILE",
	"VISUAL",
	"WAYLAND_DISPLAY",
	"WINDIR",
	"WSL_DISTRO_NAME",
	"WSL_INTEROP",
	"XDG_CACHE_HOME",
	"XDG_CONFIG_HOME",
	"XDG_DATA_HOME",
	"XDG_RUNTIME_DIR",
	"XDG_STATE_HOME",
]);

const NETWORK_ENVIRONMENT = new Set([
	"ALL_PROXY",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"NO_PROXY",
	"all_proxy",
	"http_proxy",
	"https_proxy",
	"no_proxy",
]);

const RECODE_ENVIRONMENT = new Set([
	"PI_CODING_AGENT_DIR",
	"PI_CODING_AGENT_SESSION_DIR",
	"PI_CONFIG_DIR",
	"PI_DISABLE_LSPMUX",
	"PI_EXPERIMENTAL",
	"PI_HARDWARE_CURSOR",
	"PI_OFFLINE",
	"PI_ORCHESTRATOR_DIR",
	"PI_PACKAGE_DIR",
	"PI_SKIP_VERSION_CHECK",
	"PI_STARTUP_BENCHMARK",
	"PI_STARTUP_BENCHMARK_INPUT",
	"PI_STARTUP_PROBE",
	"PI_TELEMETRY",
	"RECODE_DELEGATION",
]);

const PROVIDER_CREDENTIAL_ENVIRONMENT = new Set([
	"AI_GATEWAY_API_KEY",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_OAUTH_TOKEN",
	"ANT_LING_API_KEY",
	"AWS_ACCESS_KEY_ID",
	"AWS_DEFAULT_REGION",
	"AWS_PROFILE",
	"AWS_REGION",
	"AWS_SECRET_ACCESS_KEY",
	"AWS_SESSION_TOKEN",
	"AZURE_OPENAI_API_KEY",
	"CEREBRAS_API_KEY",
	"CLOUDFLARE_API_KEY",
	"DEEPSEEK_API_KEY",
	"FIREWORKS_API_KEY",
	"GEMINI_API_KEY",
	"GOOGLE_APPLICATION_CREDENTIALS",
	"GOOGLE_CLOUD_API_KEY",
	"GROQ_API_KEY",
	"KIMI_API_KEY",
	"MINIMAX_API_KEY",
	"MINIMAX_CN_API_KEY",
	"MISTRAL_API_KEY",
	"MOONSHOT_API_KEY",
	"NVIDIA_API_KEY",
	"OPENAI_API_KEY",
	"OPENCODE_API_KEY",
	"OPENROUTER_API_KEY",
	"PI_GATEWAY_API_KEY",
	"TOGETHER_API_KEY",
	"XAI_API_KEY",
	"XIAOMI_API_KEY",
	"XIAOMI_TOKEN_PLAN_AMS_API_KEY",
	"XIAOMI_TOKEN_PLAN_CN_API_KEY",
	"XIAOMI_TOKEN_PLAN_SGP_API_KEY",
	"ZAI_API_KEY",
	"ZAI_CODING_CN_API_KEY",
]);

function parseAdditionalNames(value: string | undefined): Set<string> {
	if (!value?.trim()) return new Set();
	const names = value
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	if (names.length > 64 || names.some((name) => !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name))) {
		throw new Error("RECODE_MAESTRO_CHILD_ENV_ALLOW must contain at most 64 comma-separated environment names");
	}
	return new Set(names);
}

export function createMaestroChildEnvironment(
	source: NodeJS.ProcessEnv,
	workspaceAccess: WorkspaceAccessMode,
): NodeJS.ProcessEnv {
	const additional = parseAdditionalNames(
		source.RECODE_MAESTRO_CHILD_ENV_ALLOW ?? source.REPI_MAESTRO_CHILD_ENV_ALLOW,
	);
	const allowed = new Set([
		...SYSTEM_ENVIRONMENT,
		...NETWORK_ENVIRONMENT,
		...RECODE_ENVIRONMENT,
		...PROVIDER_CREDENTIAL_ENVIRONMENT,
		...additional,
	]);
	const normalizedAllowed = new Set(
		[...allowed].map((name) => (process.platform === "win32" ? name.toLowerCase() : name)),
	);
	const result: NodeJS.ProcessEnv = {};
	for (const [name, value] of Object.entries(source)) {
		if (value === undefined) continue;
		const normalized = process.platform === "win32" ? name.toLowerCase() : name;
		if (normalizedAllowed.has(normalized) || name.startsWith("LC_")) result[name] = value;
	}
	if (result.RECODE_DELEGATION === undefined && source.REPI_DELEGATION !== undefined) {
		result.RECODE_DELEGATION = source.REPI_DELEGATION;
	}
	result.RECODE_WORKSPACE_ACCESS = workspaceAccess;
	return result;
}
