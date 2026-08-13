import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "vitest";
import { classifyInstallationSnapshot } from "../src/config.ts";
import { evaluateSelfUpdateConfirmation, writeSelfUpdateRollbackReceipt } from "../src/self-update-policy.ts";

describe("self-update policy", () => {
	test("classifies update strategies without allowing ambiguous installations", () => {
		assert.equal(
			classifyInstallationSnapshot({
				installMethod: "npm",
				hasReleaseProvenance: true,
				hasSourceTree: false,
				managedByGlobalPackageManager: true,
			}).kind,
			"published-global-package",
		);
		assert.equal(
			classifyInstallationSnapshot({
				installMethod: "npm",
				hasReleaseProvenance: false,
				hasSourceTree: true,
				managedByGlobalPackageManager: true,
			}).kind,
			"linked-source",
		);
		assert.equal(
			classifyInstallationSnapshot({
				installMethod: "unknown",
				hasReleaseProvenance: false,
				hasSourceTree: false,
				managedByGlobalPackageManager: false,
			}).selfUpdateEligible,
			false,
		);
	});

	test("requires explicit approval outside an interactive terminal", () => {
		assert.equal(evaluateSelfUpdateConfirmation({ force: false, interactive: false }).approved, false);
		assert.equal(evaluateSelfUpdateConfirmation({ force: true, interactive: false }).approved, true);
		assert.equal(evaluateSelfUpdateConfirmation({ force: false, interactive: true, answer: "yes" }).approved, true);
	});

	test("writes a bounded rollback receipt before mutation", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "recode-update-policy-"));
		try {
			const path = writeSelfUpdateRollbackReceipt({
				agentDir,
				currentVersion: "0.81.5",
				targetVersion: "0.81.6",
				packageName: "@reitaard/recode-coding-agent",
				installation: {
					kind: "published-global-package",
					installMethod: "npm",
					selfUpdateEligible: true,
					reason: "verified",
				},
				now: () => new Date("2026-07-30T00:00:00.000Z"),
			});
			const receipt = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
			assert.equal(receipt.restoreSpec, "@reitaard/recode-coding-agent@0.81.5");
			assert.equal(receipt.targetVersion, "0.81.6");
		} finally {
			rmSync(agentDir, { recursive: true, force: true });
		}
	});
});
