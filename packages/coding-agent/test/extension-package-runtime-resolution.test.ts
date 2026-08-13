import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ResolvedResource } from "../src/core/package-manager.ts";
import { markExtensionPackagesSessionStarted, resolvePackageRuntimeExtensions } from "../src/core/resource-loader.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function createResource(packageRoot: string, source: string): ResolvedResource {
	return {
		path: join(packageRoot, "index.ts"),
		enabled: true,
		metadata: {
			source,
			scope: "user",
			origin: "package",
			baseDir: packageRoot,
		},
	};
}

describe("extension package runtime resolution", () => {
	it("marks session-start readiness without falsely completing explicit readiness", () => {
		const diagnostics = [
			{
				packagePath: "C:/packages/session/package.json",
				source: "session-package",
				status: "verified" as const,
				readinessContracts: ["session-start" as const],
				registration: "registered" as const,
				readinessState: "pending" as const,
				errors: [],
			},
			{
				packagePath: "C:/packages/explicit/package.json",
				source: "explicit-package",
				status: "verified" as const,
				readinessContracts: ["explicit" as const],
				registration: "registered" as const,
				readinessState: "pending" as const,
				errors: [],
			},
		];
		markExtensionPackagesSessionStarted({
			extensions: [],
			errors: [],
			packageRuntimeDiagnostics: diagnostics,
			runtime: {} as never,
		});

		expect(diagnostics[0].readinessState).toBe("ready");
		expect(diagnostics[1].readinessState).toBe("pending");
	});

	it("reports source-only compatibility packages without changing their entry", () => {
		const packageRoot = mkdtempSync(join(tmpdir(), "recode-package-resolution-"));
		temporaryDirectories.push(packageRoot);
		writeFileSync(join(packageRoot, "index.ts"), "export default () => {};\n");
		writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ pi: { extensions: ["./index.ts"] } }));
		const resource = createResource(packageRoot, "npm:source-only-package");

		const result = resolvePackageRuntimeExtensions([resource]);

		expect(result.errors).toEqual([]);
		expect(result.resources).toEqual([resource]);
		expect(result.diagnostics).toEqual([
			{
				packagePath: join(packageRoot, "package.json"),
				source: "npm:source-only-package",
				status: "source-only",
				readinessContracts: [],
				registration: "pending",
				readinessState: "pending",
				errors: [],
			},
		]);
	});

	it("replaces a package source entry with its verified built artifact", () => {
		const packageRoot = mkdtempSync(join(tmpdir(), "recode-package-resolution-"));
		temporaryDirectories.push(packageRoot);
		const sourceCode = "export default () => {};\n";
		const builtCode = "export default () => {};\n//# sourceMappingURL=index.js.map\n";
		mkdirSync(join(packageRoot, "dist"));
		writeFileSync(join(packageRoot, "index.ts"), sourceCode);
		writeFileSync(join(packageRoot, "dist", "index.js"), builtCode);
		writeFileSync(join(packageRoot, "dist", "index.js.map"), "{}");
		writeFileSync(
			join(packageRoot, "package.json"),
			JSON.stringify({
				pi: {
					extensions: ["./index.ts"],
					runtime: {
						contractVersion: 1,
						codingAgent: ">=0.81.4 <0.83.0",
						extensions: [
							{
								source: "./index.ts",
								entry: "./dist/index.js",
								sourceMap: "./dist/index.js.map",
								sha256: createHash("sha256").update(builtCode).digest("hex"),
								activation: "process",
								readiness: "registered",
								shutdown: "process-stop",
							},
						],
					},
				},
			}),
		);

		const result = resolvePackageRuntimeExtensions([createResource(packageRoot, "git:first-party-browser")]);

		expect(result.errors).toEqual([]);
		expect(result.resources[0].path).toBe(join(packageRoot, "dist", "index.js"));
		expect(result.diagnostics[0].status).toBe("verified");
	});

	it("removes invalid declared packages from the load set", () => {
		const packageRoot = mkdtempSync(join(tmpdir(), "recode-package-resolution-"));
		temporaryDirectories.push(packageRoot);
		writeFileSync(join(packageRoot, "index.ts"), "export default () => {};\n");
		writeFileSync(
			join(packageRoot, "package.json"),
			JSON.stringify({
				pi: {
					runtime: {
						contractVersion: 1,
						codingAgent: ">=0.81.4 <0.83.0",
						extensions: [
							{
								source: "./index.ts",
								entry: "./dist/missing.js",
								sha256: "0".repeat(64),
								activation: "session",
								readiness: "registered",
								shutdown: "session-shutdown",
							},
						],
					},
				},
			}),
		);

		const result = resolvePackageRuntimeExtensions([createResource(packageRoot, "npm:invalid-package")]);

		expect(result.resources).toEqual([]);
		expect(result.diagnostics[0].status).toBe("invalid");
		expect(result.errors[0].error).toContain("entry does not exist");
	});
});
