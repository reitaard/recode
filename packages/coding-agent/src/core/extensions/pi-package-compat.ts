const PI_PACKAGE_PREFIXES = ["@earendil-works", "@mariozechner"] as const;

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
	["pi-coding-agent/rpc-entry", "@reitaard/recode-coding-agent/rpc-entry"],
	["pi-tui", "@reitaard/recode-tui"],
]);

const INSTALL_MARKER = Symbol.for("recode.pi-package-compat-hooks");

type CompatibilityGlobal = typeof globalThis & {
	[INSTALL_MARKER]?: boolean;
};

/** Map supported upstream Pi package specifiers onto Recode's public runtime. */
export function mapPiPackageSpecifier(specifier: string): string {
	for (const scope of PI_PACKAGE_PREFIXES) {
		const prefix = `${scope}/`;
		if (!specifier.startsWith(prefix)) continue;
		return PACKAGE_ALIASES.get(specifier.slice(prefix.length)) ?? specifier;
	}
	return specifier;
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
		for (const target of new Set(PACKAGE_ALIASES.values())) {
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
