import { describe, expect, it } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.ts";

describe("compaction settings", () => {
	it("defaults to the current model with thinking disabled", () => {
		const settings = SettingsManager.inMemory();

		expect(settings.getCompactionModel()).toBe("current");
		expect(settings.getCompactionThinkingLevel()).toBe("off");
		expect(settings.getCompactionSettings()).toMatchObject({
			enabled: true,
			model: "current",
			thinkingLevel: "off",
		});
	});

	it("persists a pinned model and independent thinking level", () => {
		const settings = SettingsManager.inMemory();

		settings.setCompactionModel("open-provider/qwen2.5-3b-instruct");
		settings.setCompactionThinkingLevel("high");

		expect(settings.getCompactionModel()).toBe("open-provider/qwen2.5-3b-instruct");
		expect(settings.getCompactionThinkingLevel()).toBe("high");
		expect(settings.getGlobalSettings().compaction).toMatchObject({
			model: "open-provider/qwen2.5-3b-instruct",
			thinkingLevel: "high",
		});
	});
});
