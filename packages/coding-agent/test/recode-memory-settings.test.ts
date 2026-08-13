import { describe, expect, it, vi } from "vitest";
import { RecodeMemorySettingsComponent } from "../src/modes/interactive/components/recode-memory-settings.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

function createComponent(onChange = vi.fn(), onCancel = vi.fn()): RecodeMemorySettingsComponent {
	return new RecodeMemorySettingsComponent(
		{
			enabled: true,
			projectAutoRecall: true,
			globalAccess: false,
			globalAutoRecall: false,
			shioriModel: "current (qwen3.5-9b)",
			shioriModels: ["current (qwen3.5-9b)", "memory-model"],
			shioriThinking: false,
			cardinalRouting: "auto",
			searchScope: "project",
		},
		onChange,
		onCancel,
	);
}

describe("Kioku memory settings", () => {
	it("supports searchable settings and wraparound navigation", () => {
		initTheme("dark");
		const component = createComponent();
		expect(stripAnsi(component.render(80).join("\n"))).toContain("Type to search");

		component.handleInput("\x1b[A");
		const wrapped = stripAnsi(component.render(80).join("\n"));
		expect(wrapped).toContain("Show status");
		expect(wrapped).toContain("(10/10)");

		for (const character of "shiori") component.handleInput(character);
		const filtered = stripAnsi(component.render(80).join("\n"));
		expect(filtered).toContain("Shiori (栞) model");
		expect(filtered).toContain("Shiori (栞) thinking");
		expect(filtered).not.toContain("Project auto-recall");
	});
});
