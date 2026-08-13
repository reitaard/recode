import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { InstallationClassification } from "./config.ts";

export interface SelfUpdateConfirmation {
	approved: boolean;
	requiresPrompt: boolean;
	diagnostic?: string;
}

export function evaluateSelfUpdateConfirmation(options: {
	force: boolean;
	interactive: boolean;
	answer?: string;
}): SelfUpdateConfirmation {
	if (options.force) return { approved: true, requiresPrompt: false };
	if (!options.interactive) {
		return {
			approved: false,
			requiresPrompt: false,
			diagnostic: "Non-interactive Recode self-update requires --force as explicit approval",
		};
	}
	if (options.answer === undefined) return { approved: false, requiresPrompt: true };
	return { approved: /^(?:y|yes)$/i.test(options.answer.trim()), requiresPrompt: false };
}

export function writeSelfUpdateRollbackReceipt(options: {
	agentDir: string;
	currentVersion: string;
	targetVersion: string;
	packageName: string;
	installation: InstallationClassification;
	now?: () => Date;
}): string {
	const path = join(options.agentDir, "self-update-rollback.json");
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	const descriptor = openSync(temporaryPath, "wx", 0o600);
	try {
		writeFileSync(
			descriptor,
			`${JSON.stringify(
				{
					schemaVersion: 1,
					createdAt: (options.now ?? (() => new Date()))().toISOString(),
					packageName: options.packageName,
					previousVersion: options.currentVersion,
					targetVersion: options.targetVersion,
					installationKind: options.installation.kind,
					installMethod: options.installation.installMethod,
					restoreSpec: `${options.packageName}@${options.currentVersion}`,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
	renameSync(temporaryPath, path);
	return path;
}
