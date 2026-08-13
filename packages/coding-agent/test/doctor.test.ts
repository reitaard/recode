import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createDoctorReport, type DoctorSnapshot, renderDoctorReport } from "../src/doctor.ts";

function createSnapshot(overrides: Partial<DoctorSnapshot> = {}): DoctorSnapshot {
	const sourceCommit = "a".repeat(40);
	return {
		version: "0.81.5",
		packageSourceCommit: sourceCommit,
		release: { present: true, valid: true, version: "0.81.5", sourceCommit },
		installation: {
			kind: "published-global-package",
			installMethod: "npm",
			selfUpdateEligible: true,
			reason: "verified Recode package managed by its global package manager",
		},
		settings: {
			valid: true,
			defaultProvider: "openai-oauth",
			defaultModel: "gpt-test",
			authRequired: false,
			packages: ["npm:example-alpha", "npm:example-beta", "git:example.invalid/example-gamma"],
			lsp: { enabled: true, lspmux: true, projectOnly: true },
		},
		auth: { configured: true, source: "stored" },
		maestro: {
			state: "ready",
			ready: true,
			liveInstances: 0,
			waitingInput: 0,
			restartLoopDetected: false,
		},
		integrations: {
			configuredPackages: 3,
			installedPackages: 3,
			missingPackages: 0,
			verifiedPackages: 1,
			invalidPackages: 0,
			sourceOnlyPackages: 2,
			extensions: 3,
			tools: 8,
			providers: 1,
			services: 2,
			mcpServerCount: 1,
			mcpConfigErrors: 0,
		},
		memory: { indexPresent: true, indexBytes: 4096, canonicalMemoryPresent: true },
		...overrides,
	};
}

describe("Recode Doctor", () => {
	test("reports a deterministic healthy offline snapshot", () => {
		const report = createDoctorReport(createSnapshot(), new Date("2026-08-02T00:00:00.000Z"));
		assert.equal(report.verdict, "healthy");
		assert.equal(report.createdAt, "2026-08-02T00:00:00.000Z");
		const rendered = renderDoctorReport(report);
		assert.match(rendered, /^Recode Doctor/);
		assert.match(rendered, /\[PASS\] Release identity/);
		assert.match(rendered, /No service was started/);
		assert.doesNotMatch(rendered, /access_token|api[_-]?key/i);
	});

	test("fails closed on release identity divergence", () => {
		const report = createDoctorReport(
			createSnapshot({ release: { present: true, valid: true, version: "0.81.5", sourceCommit: "c".repeat(40) } }),
		);
		assert.equal(report.verdict, "failed");
		const check = report.sections
			.flatMap((section) => section.checks)
			.find((entry) => entry.id === "release-manifest");
		assert.equal(check?.status, "fail");
		assert.match(check?.next ?? "", /verified Recode artifact/);
	});

	test("identifies an unreachable selected Open Provider as the blocking failure", () => {
		const report = createDoctorReport(
			createSnapshot({
				settings: {
					valid: true,
					defaultProvider: "open-provider",
					defaultModel: "local-model",
					authRequired: false,
					packages: [],
					lsp: { enabled: true, lspmux: true, projectOnly: true },
				},
				providerProbe: { status: "timeout" },
			}),
		);
		assert.equal(report.verdict, "failed");
		const check = report.sections
			.flatMap((section) => section.checks)
			.find((entry) => entry.id === "provider-connectivity");
		assert.equal(check?.status, "fail");
		assert.match(check?.summary ?? "", /bounded timeout/);
		assert.match(check?.next ?? "", /Restore access/);
		const rendered = renderDoctorReport(report);
		assert.match(rendered, /Problem: Open Provider did not respond/);
		assert.match(rendered, /Fix: Restore access/);
	});

	test("groups arbitrary package failures without package-name assumptions", () => {
		const snapshot = createSnapshot();
		snapshot.integrations = {
			...snapshot.integrations,
			configuredPackages: 12,
			installedPackages: 11,
			missingPackages: 1,
		};
		const report = createDoctorReport(snapshot);
		const checks = report.sections.flatMap((section) => section.checks);
		assert.equal(checks.find((entry) => entry.id === "packages")?.status, "fail");
		assert.equal(checks.filter((entry) => entry.id.startsWith("package-")).length, 0);
		assert.match(
			checks.find((entry) => entry.id === "extension-capabilities")?.summary ?? "",
			/extension\(s\) declare/,
		);
	});

	test("fails closed when Maestro reports canonical state divergence", () => {
		const snapshot = createSnapshot();
		if (!snapshot.maestro) throw new Error("fixture requires Maestro health");
		snapshot.maestro.diagnostic = "STATE_DIVERGENCE: redacted fixture";
		const report = createDoctorReport(snapshot);
		assert.equal(report.verdict, "failed");
		const check = report.sections.flatMap((section) => section.checks).find((entry) => entry.id === "maestro");
		assert.equal(check?.status, "fail");
		assert.doesNotMatch(check?.summary ?? "", /fixture/);
	});

	test("keeps unavailable optional services actionable without claiming failure", () => {
		const report = createDoctorReport(
			createSnapshot({
				maestro: undefined,
				maestroError: true,
				memory: { indexPresent: false, indexBytes: 0, canonicalMemoryPresent: false },
			}),
		);
		assert.equal(report.verdict, "attention");
		const checks = report.sections.flatMap((section) => section.checks);
		assert.equal(checks.find((entry) => entry.id === "maestro")?.status, "warn");
		assert.match(checks.find((entry) => entry.id === "maestro")?.next ?? "", /service start/);
	});

	test("surfaces retained TUI crash evidence and raw capture availability", () => {
		const report = createDoctorReport(
			createSnapshot({
				tuiDiagnostics: {
					diagnosticsPath: "diagnostics.jsonl",
					diagnosticsPresent: true,
					diagnosticsBytes: 512,
					eventCount: 3,
					invalidEventCount: 0,
					crashCount: 1,
					unhandledRejectionCount: 0,
					overflowCount: 1,
					slowRenderCount: 1,
					rawLogDirectory: "tui-logs",
					rawCaptureFiles: 1,
					rawCaptureBytes: 2048,
				},
			}),
		);
		const check = report.sections
			.flatMap((section) => section.checks)
			.find((entry) => entry.id === "tui-diagnostics");
		assert.equal(check?.status, "warn");
		assert.match(check?.summary ?? "", /crash event/);
		assert.match(check?.next ?? "", /diagnostics\.jsonl/);
	});
});
