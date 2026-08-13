import type { ThinkingLevel } from "@reitaard/recode-agent-core";

export function hasBinaryThinkingLevels(levels: readonly ThinkingLevel[]): boolean {
	return levels.length === 2 && levels.includes("off") && levels.includes("medium");
}

export function formatRecodeThinkingLevel(level: ThinkingLevel, availableLevels: readonly ThinkingLevel[]): string {
	if (hasBinaryThinkingLevels(availableLevels) && level === "medium") return "on";
	return level;
}
