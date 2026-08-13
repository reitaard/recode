import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ThinkingLevel } from "@reitaard/recode-agent-core";
import type { WorkerDirectory, WorkerModelPreference, WorkerRuntimeSettings } from "./worker-directory.ts";

export interface PersistedWorkerSettings {
	modelPreference?: WorkerModelPreference;
	thinkingLevel?: ThinkingLevel;
	maxOutputTokens?: number;
}

export type PersistedWorkerSettingsConfig = Record<string, PersistedWorkerSettings>;

const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function normalizeWorkerSettingsConfig(value: unknown): PersistedWorkerSettingsConfig {
	if (!isRecord(value)) return {};
	const normalized: PersistedWorkerSettingsConfig = {};
	for (const [workerId, rawSettings] of Object.entries(value)) {
		if (!isRecord(rawSettings)) continue;
		const thinkingLevel = THINKING_LEVELS.find((level) => level === rawSettings.thinkingLevel);
		const maxOutputTokens =
			typeof rawSettings.maxOutputTokens === "number" &&
			Number.isInteger(rawSettings.maxOutputTokens) &&
			rawSettings.maxOutputTokens > 0
				? rawSettings.maxOutputTokens
				: undefined;
		const modelPreference =
			isRecord(rawSettings.modelPreference) &&
			typeof rawSettings.modelPreference.provider === "string" &&
			typeof rawSettings.modelPreference.id === "string" &&
			rawSettings.modelPreference.provider.trim() &&
			rawSettings.modelPreference.id.trim()
				? { provider: rawSettings.modelPreference.provider, id: rawSettings.modelPreference.id }
				: undefined;
		normalized[workerId] = {
			...(thinkingLevel ? { thinkingLevel } : {}),
			...(maxOutputTokens ? { maxOutputTokens } : {}),
			...(modelPreference ? { modelPreference } : {}),
		};
	}
	return normalized;
}

export async function readWorkerSettingsConfig(path: string): Promise<PersistedWorkerSettingsConfig> {
	try {
		return normalizeWorkerSettingsConfig(JSON.parse(await readFile(path, "utf8")));
	} catch {
		return {};
	}
}

export async function writeWorkerSettingsConfig(path: string, config: PersistedWorkerSettingsConfig): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function applyWorkerSettingsConfig(directory: WorkerDirectory, config: PersistedWorkerSettingsConfig): void {
	for (const worker of directory.getWorkerDefinitions()) {
		const persisted = config[worker.id] ?? {};
		const settings: WorkerRuntimeSettings = {
			thinkingLevel: persisted.thinkingLevel ?? worker.thinkingLevel ?? "off",
			maxOutputTokens: persisted.maxOutputTokens ?? worker.maxOutputTokens ?? 4_096,
			...(persisted.modelPreference ? { modelPreference: persisted.modelPreference } : {}),
		};
		directory.setWorkerSettings(worker.id, settings);
	}
}
