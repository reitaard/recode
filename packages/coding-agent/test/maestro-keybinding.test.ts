import { describe, expect, it } from "vitest";
import { TUI_KEYBINDINGS } from "../../tui/src/keybindings.ts";
import { KEYBINDINGS, KeybindingsManager } from "../src/core/keybindings.ts";

describe("Recode keybinding policy", () => {
	it("uses the canonical bindings on every platform", () => {
		expect(KEYBINDINGS["tui.input.newLine"].defaultKeys).toEqual(["shift+enter", "ctrl+j"]);
		expect(KEYBINDINGS["app.message.followUp"].defaultKeys).toEqual(["alt+enter"]);
		expect(KEYBINDINGS["app.message.dequeue"].defaultKeys).toEqual(["alt+up"]);
		expect(KEYBINDINGS["app.clipboard.pasteImage"].defaultKeys).toEqual(["ctrl+v", "alt+v"]);
		expect(TUI_KEYBINDINGS["tui.editor.undo"].defaultKeys).toEqual(["ctrl+z", "ctrl+-"]);
		expect(KEYBINDINGS["app.suspend"].defaultKeys).toEqual([]);

		const manager = new KeybindingsManager();
		expect(manager.getKeys("app.message.dequeue")).toEqual(["alt+up"]);
		expect(manager.getKeys("app.clipboard.pasteImage")).toEqual(["ctrl+v", "alt+v"]);
	});
});
