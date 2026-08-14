export const PI_PACKAGE_SCOPES = ["@earendil-works", "@mariozechner"] as const;

const PACKAGE_ALIASES = new Map<string, string>([
	// The pi-ai root intentionally uses the compat entrypoint because third-party
	// extensions still rely on the historical global stream()/complete() API.
	["pi-ai", "@reitaard/recode-ai/compat"],
	["pi-ai/compat", "@reitaard/recode-ai/compat"],
	["pi-ai/oauth", "@reitaard/recode-ai/oauth"],
	["pi-agent-core", "@reitaard/recode-agent-core"],
	["pi-agent-core/node", "@reitaard/recode-agent-core/node"],
	["pi-coding-agent", "@reitaard/recode-coding-agent"],
	["pi-coding-agent/workers", "@reitaard/recode-coding-agent/workers"],
	["pi-tui", "@reitaard/recode-tui"],
]);

const INSTALL_MARKER = Symbol.for("recode.pi-package-compat-hooks");

type CompatibilityGlobal = typeof globalThis & {
	[INSTALL_MARKER]?: boolean;
};

export interface PiPackageSpecifierMapping {
	source: string;
	target: string;
}

const LEGACY_REPI_ALIASES = new Map<string, string>([
	["@reitaard/repi-ai", "@reitaard/recode-ai/compat"],
	["@reitaard/repi-ai/compat", "@reitaard/recode-ai/compat"],
	["@reitaard/repi-ai/oauth", "@reitaard/recode-ai/oauth"],
	["@reitaard/repi-agent-core", "@reitaard/recode-agent-core"],
	["@reitaard/repi-agent-core/node", "@reitaard/recode-agent-core/node"],
	["@reitaard/repi-coding-agent", "@reitaard/recode-coding-agent"],
	["@reitaard/repi-coding-agent/workers", "@reitaard/recode-coding-agent/workers"],
	["@reitaard/repi-tui", "@reitaard/recode-tui"],
]);

const SPECIFIER_MAPPINGS: readonly PiPackageSpecifierMapping[] = [
	...PI_PACKAGE_SCOPES.flatMap((scope) =>
		Array.from(PACKAGE_ALIASES, ([packagePath, target]) => ({ source: `${scope}/${packagePath}`, target })),
	),
	...Array.from(LEGACY_REPI_ALIASES, ([source, target]) => ({ source, target })),
];
const SPECIFIER_TARGETS = new Map(SPECIFIER_MAPPINGS.map(({ source, target }) => [source, target]));

/** List the supported upstream package identities and their canonical Recode targets. */
export function getPiPackageSpecifierMappings(): readonly PiPackageSpecifierMapping[] {
	return SPECIFIER_MAPPINGS;
}

/** Map supported upstream Pi package specifiers onto Recode's public runtime. */
export function mapPiPackageSpecifier(specifier: string): string {
	return SPECIFIER_TARGETS.get(specifier) ?? specifier;
}

/** Bind aliases for canonical targets supplied by a loader. */
export function bindPiPackageCompatibilityAliases<T>(targets: Readonly<Record<string, T>>): Record<string, T> {
	const aliases: Record<string, T> = {};
	for (const { source, target } of SPECIFIER_MAPPINGS) {
		const value = targets[target];
		if (value !== undefined) aliases[source] = value;
	}
	return aliases;
}

/**
 * Install synchronous Node module-resolution hooks before Recode imports its
 * application graph. The hooks affect ESM import(), require(), and createRequire(),
 * which covers jiti-loaded TypeScript extensions.
 *
 * Targets are resolved from this host module before hooks are registered. Returning
 * those absolute URLs is essential: resolving a renamed bare package from an
 * extension would otherwise search ~/.pi/agent/npm instead of Recode's runtime.
 *
 * Bun uses the extension loader's virtual-module path instead and does not install
 * Node hooks here.
 */
export async function installPiPackageCompatibilityHooks(): Promise<void> {
	if ((process.versions as NodeJS.ProcessVersions & { bun?: string }).bun) return;

	const compatibilityGlobal = globalThis as CompatibilityGlobal;
	if (compatibilityGlobal[INSTALL_MARKER]) return;
	compatibilityGlobal[INSTALL_MARKER] = true;

	try {
		const resolvedTargets = new Map<string, string>();
		for (const target of new Set(SPECIFIER_MAPPINGS.map(({ target }) => target))) {
			resolvedTargets.set(target, import.meta.resolve(target));
		}

		const { registerHooks } = await import("node:module");
		registerHooks({
			resolve(specifier, context, nextResolve) {
				const mapped = mapPiPackageSpecifier(specifier);
				if (mapped === specifier) return nextResolve(specifier, context);
				const url = resolvedTargets.get(mapped);
				if (!url) return nextResolve(mapped, context);
				return { url, shortCircuit: true };
			},
		});
	} catch (error) {
		delete compatibilityGlobal[INSTALL_MARKER];
		throw error;
	}
}
