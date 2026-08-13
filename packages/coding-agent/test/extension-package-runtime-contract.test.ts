import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	EXTENSION_RUNTIME_CONTRACT_VERSION,
	inspectExtensionPackageRuntime,
	parseExtensionPackageRuntimeContract,
} from "../src/core/extensions/package-runtime-contract.ts";

const digest = "a".repeat(64);
const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function validContract() {
	return {
		contractVersion: EXTENSION_RUNTIME_CONTRACT_VERSION,
		codingAgent: ">=0.81.4 <0.82.0",
		declarations: {
			tools: ["browser"],
			commands: [],
			providers: [],
			permissions: ["network", "browser-control"],
			services: ["browser-runtime"],
			projectTrust: "none",
		},
		extensions: [
			{
				source: "./index.ts",
				entry: "./dist/index.js",
				sourceMap: "./dist/index.js.map",
				sha256: digest,
				activation: "session",
				readiness: "session-start",
				shutdown: "session-shutdown",
			},
		],
	};
}

describe("extension package runtime contract", () => {
	it("treats an omitted contract as a source-only compatibility package", () => {
		expect(parseExtensionPackageRuntimeContract(undefined)).toEqual({ errors: [] });
	});

	it("accepts a complete built artifact declaration", () => {
		expect(parseExtensionPackageRuntimeContract(validContract())).toEqual({
			contract: validContract(),
			errors: [],
		});
	});

	it("rejects traversal, TypeScript runtime entries, and invalid hashes", () => {
		const contract = validContract();
		contract.extensions[0].entry = "../outside.ts";
		contract.extensions[0].sha256 = "not-a-digest";
		const result = parseExtensionPackageRuntimeContract(contract);

		expect(result.contract).toBeUndefined();
		expect(result.errors).toContain("pi.runtime.extensions[0].entry must be a safe package-relative JavaScript path");
		expect(result.errors).toContain(
			"pi.runtime.extensions[0].sha256 must be a lowercase 64-character SHA-256 hex digest",
		);
	});

	it("rejects invalid or duplicate declarative activation metadata", () => {
		const contract = validContract();
		contract.declarations.tools = ["browser", "browser"];
		contract.declarations.permissions = [""];
		contract.declarations.projectTrust = "sometimes";
		const result = parseExtensionPackageRuntimeContract(contract);

		expect(result.errors).toContain("pi.runtime.declarations.tools must not contain duplicates");
		expect(result.errors).toContain("pi.runtime.declarations.permissions must be an array of non-empty strings");
		expect(result.errors).toContain("pi.runtime.declarations.projectTrust must be none or trusted");
	});

	it("rejects unknown lifecycle ownership values", () => {
		const contract = validContract();
		contract.extensions[0].activation = "global";
		contract.extensions[0].readiness = "eventually";
		contract.extensions[0].shutdown = "never";
		const result = parseExtensionPackageRuntimeContract(contract);

		expect(result.errors).toEqual([
			"pi.runtime.extensions[0].activation must be session, process, or service",
			"pi.runtime.extensions[0].readiness must be registered, session-start, or explicit",
			"pi.runtime.extensions[0].shutdown must be session-shutdown, process-stop, or explicit",
		]);
	});

	it("verifies compatible files and their declared digest", () => {
		const packageRoot = mkdtempSync(join(tmpdir(), "recode-extension-runtime-"));
		temporaryDirectories.push(packageRoot);
		mkdirSync(join(packageRoot, "dist"));
		writeFileSync(join(packageRoot, "index.ts"), "export default () => {};");
		const builtCode = "export default () => {};\n";
		writeFileSync(join(packageRoot, "dist", "index.js"), builtCode);
		writeFileSync(join(packageRoot, "dist", "index.js.map"), "{}");
		const packageContract = validContract();
		packageContract.extensions[0].sha256 = createHash("sha256").update(builtCode).digest("hex");
		const packageJsonPath = join(packageRoot, "package.json");
		writeFileSync(packageJsonPath, JSON.stringify({ name: "verified-extension", pi: { runtime: packageContract } }));

		const result = inspectExtensionPackageRuntime(packageJsonPath, "0.81.4");

		expect(result.status).toBe("verified");
		expect(result.errors).toEqual([]);
		expect(result.artifacts?.[0].resolvedEntry).toBe(join(packageRoot, "dist", "index.js"));
	});

	it("fails closed for incompatible versions and artifact tampering", () => {
		const packageRoot = mkdtempSync(join(tmpdir(), "recode-extension-runtime-"));
		temporaryDirectories.push(packageRoot);
		mkdirSync(join(packageRoot, "dist"));
		writeFileSync(join(packageRoot, "index.ts"), "source");
		writeFileSync(join(packageRoot, "dist", "index.js"), "tampered");
		const packageContract = validContract();
		packageContract.codingAgent = ">=0.82.0";
		const packageJsonPath = join(packageRoot, "package.json");
		writeFileSync(packageJsonPath, JSON.stringify({ pi: { runtime: packageContract } }));

		expect(inspectExtensionPackageRuntime(packageJsonPath, "0.81.4").status).toBe("incompatible");
		packageContract.codingAgent = ">=0.81.4 <0.82.0";
		writeFileSync(packageJsonPath, JSON.stringify({ pi: { runtime: packageContract } }));
		const tampered = inspectExtensionPackageRuntime(packageJsonPath, "0.81.4");
		expect(tampered.status).toBe("invalid");
		expect(tampered.errors).toContain("pi.runtime.extensions[0].entry SHA-256 does not match the manifest");
	});

	it("rejects unsupported contract versions and empty compatibility ranges", () => {
		const contract = validContract();
		contract.contractVersion = 2;
		contract.codingAgent = " ";
		const result = parseExtensionPackageRuntimeContract(contract);

		expect(result.errors).toContain("pi.runtime.contractVersion must be 1");
		expect(result.errors).toContain("pi.runtime.codingAgent must be a non-empty compatibility range");
	});
});
