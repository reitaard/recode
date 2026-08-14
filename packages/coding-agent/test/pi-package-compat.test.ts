import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadExtensions } from "../src/core/extensions/loader.ts";
import {
	bindPiPackageCompatibilityAliases,
	getPiPackageSpecifierMappings,
	mapPiPackageSpecifier,
	PI_PACKAGE_SCOPES,
} from "../src/core/extensions/pi-package-compat.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("Pi package compatibility mapping", () => {
	it.each(PI_PACKAGE_SCOPES)("maps the %s Pi package scope", (scope) => {
		expect(mapPiPackageSpecifier(`${scope}/pi-ai`)).toBe("@reitaard/recode-ai/compat");
		expect(mapPiPackageSpecifier(`${scope}/pi-ai/compat`)).toBe("@reitaard/recode-ai/compat");
		expect(mapPiPackageSpecifier(`${scope}/pi-ai/oauth`)).toBe("@reitaard/recode-ai/oauth");
		expect(mapPiPackageSpecifier(`${scope}/pi-agent-core`)).toBe("@reitaard/recode-agent-core");
		expect(mapPiPackageSpecifier(`${scope}/pi-agent-core/node`)).toBe("@reitaard/recode-agent-core/node");
		expect(mapPiPackageSpecifier(`${scope}/pi-coding-agent`)).toBe("@reitaard/recode-coding-agent");
		expect(mapPiPackageSpecifier(`${scope}/pi-coding-agent/workers`)).toBe("@reitaard/recode-coding-agent/workers");
		expect(mapPiPackageSpecifier(`${scope}/pi-tui`)).toBe("@reitaard/recode-tui");
		expect(mapPiPackageSpecifier(`${scope}/pi-coding-agent/rpc-entry`)).toBe(`${scope}/pi-coding-agent/rpc-entry`);
	});

	it("maps legacy RePi imports used by existing installed extensions", () => {
		expect(mapPiPackageSpecifier("@reitaard/repi-ai")).toBe("@reitaard/recode-ai/compat");
		expect(mapPiPackageSpecifier("@reitaard/repi-ai/oauth")).toBe("@reitaard/recode-ai/oauth");
		expect(mapPiPackageSpecifier("@reitaard/repi-agent-core")).toBe("@reitaard/recode-agent-core");
		expect(mapPiPackageSpecifier("@reitaard/repi-agent-core/node")).toBe("@reitaard/recode-agent-core/node");
		expect(mapPiPackageSpecifier("@reitaard/repi-coding-agent")).toBe("@reitaard/recode-coding-agent");
		expect(mapPiPackageSpecifier("@reitaard/repi-coding-agent/workers")).toBe(
			"@reitaard/recode-coding-agent/workers",
		);
		expect(mapPiPackageSpecifier("@reitaard/repi-tui")).toBe("@reitaard/recode-tui");
	});

	it("leaves unrelated and unsupported package identities untouched", () => {
		expect(mapPiPackageSpecifier("typebox")).toBe("typebox");
		expect(mapPiPackageSpecifier("@modelcontextprotocol/sdk")).toBe("@modelcontextprotocol/sdk");
		expect(mapPiPackageSpecifier("@earendil-works/not-pi")).toBe("@earendil-works/not-pi");
		expect(mapPiPackageSpecifier("@earendil-works/pi-ai/private")).toBe("@earendil-works/pi-ai/private");
		expect(mapPiPackageSpecifier("@reitaard/repi-coding-agent/rpc-entry")).toBe(
			"@reitaard/repi-coding-agent/rpc-entry",
		);
	});

	it("binds every supported identity from the central registry", () => {
		const targets = Object.fromEntries(getPiPackageSpecifierMappings().map(({ target }) => [target, { target }]));
		const aliases = bindPiPackageCompatibilityAliases(targets);

		for (const { source, target } of getPiPackageSpecifierMappings()) {
			expect(aliases[source]).toBe(targets[target]);
		}
	});

	it.each([...PI_PACKAGE_SCOPES, "@reitaard"])(
		"loads %s imports through the source extension loader",
		async (scope) => {
			const directory = await mkdtemp(join(tmpdir(), "recode-pi-compat-"));
			temporaryDirectories.push(directory);
			const extensionPath = join(directory, "extension.ts");
			await writeFile(
				extensionPath,
				`import { Text as ecosystemText } from "${scope === "@reitaard" ? "@reitaard/repi-tui" : `${scope}/pi-tui`}";\n` +
					'import { Text as recodeText } from "@reitaard/recode-tui";\n' +
					`import { complete as ecosystemComplete } from "${scope === "@reitaard" ? "@reitaard/repi-ai" : `${scope}/pi-ai`}";\n` +
					'import { complete as recodeComplete } from "@reitaard/recode-ai";\n' +
					`import { NodeExecutionEnv as ecosystemNodeEnv } from "${scope === "@reitaard" ? "@reitaard/repi-agent-core/node" : `${scope}/pi-agent-core/node`}";\n` +
					'import { NodeExecutionEnv as recodeNodeEnv } from "@reitaard/recode-agent-core/node";\n' +
					`import { WorkerChatController as ecosystemWorker } from "${scope === "@reitaard" ? "@reitaard/repi-coding-agent/workers" : `${scope}/pi-coding-agent/workers`}";\n` +
					'import { WorkerChatController as recodeWorker } from "@reitaard/recode-coding-agent/workers";\n' +
					"export default function(pi) {\n" +
					'  if (ecosystemText !== recodeText || ecosystemComplete !== recodeComplete || ecosystemNodeEnv !== recodeNodeEnv || ecosystemWorker !== recodeWorker) throw new Error("duplicate runtime");\n' +
					'  pi.registerCommand("compat", { description: "compatibility fixture", handler: async () => {} });\n' +
					"}\n",
				"utf8",
			);

			const result = await loadExtensions([extensionPath], directory);
			expect(result.errors).toEqual([]);
			expect(result.extensions).toHaveLength(1);
			expect(result.extensions[0]?.commands.has("compat")).toBe(true);
		},
	);
});
