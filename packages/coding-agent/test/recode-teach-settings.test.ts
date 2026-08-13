import { describe, expect, it, vi } from "vitest";
import { RecodeTeachSettingsComponent } from "../src/modes/interactive/components/recode-teach-settings.ts";
import { RecodeWorkerDirectChatComponent } from "../src/modes/interactive/components/recode-worker-settings.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

describe("Teach Mode settings", () => {
	it("shows the active owner and proposal actions", () => {
		initTheme("dark");
		const component = new RecodeTeachSettingsComponent(
			{ ownerName: "Aizen", enabled: true, pending: 2 },
			vi.fn(),
			vi.fn(),
		);
		const rendered = stripAnsi(component.render(90).join("\n"));
		expect(rendered).toContain("Aizen Teach Mode");
		expect(rendered).toContain("2 pending");
		expect(rendered).toContain("Review proposals");
		expect(rendered).toContain("Approve proposal");
	});
});

describe("worker direct-chat Teach Mode hints", () => {
	const worker = {
		id: "audit",
		displayName: "Levi",
		aliases: ["監査"],
		description: "Audit worker",
		tools: ["read"],
		thinkingLevel: "off",
		maxOutputTokens: 4096,
	} as const;

	it("keeps hints hidden by default and reveals them with Space", () => {
		initTheme("dark");
		const component = new RecodeWorkerDirectChatComponent(worker, vi.fn(), vi.fn());
		component.handleInput("/teach");
		expect(stripAnsi(component.render(100).join("\n"))).not.toContain("/teach status");
		component.handleInput(" ");
		const rendered = stripAnsi(component.render(100).join("\n"));
		expect(rendered).toContain("/teach on");
		expect(rendered).toContain("/teach status");
		expect(rendered).toContain("Tab completes");
	});

	it("reveals with Tab and completes a unique Teach subcommand", () => {
		initTheme("dark");
		const onSubmit = vi.fn();
		const component = new RecodeWorkerDirectChatComponent(worker, onSubmit, vi.fn());
		component.handleInput("/teach");
		component.handleInput("\t");
		component.handleInput("st");
		component.handleInput("\t");
		component.handleInput("\r");
		expect(onSubmit).toHaveBeenCalledWith("/teach status");
	});

	it("submits empty Enter as an explicit new-conversation request", () => {
		initTheme("dark");
		const onSubmit = vi.fn();
		const component = new RecodeWorkerDirectChatComponent(worker, onSubmit, vi.fn());
		component.handleInput("\r");
		expect(onSubmit).toHaveBeenCalledWith("");
	});

	it("keeps queued messages inside the direct chat while a turn is running", () => {
		initTheme("dark");
		const onSubmit = vi.fn();
		const component = new RecodeWorkerDirectChatComponent(worker, onSubmit, vi.fn());
		component.setBusy(true);
		component.setQueuedMessages(["also check technology news"]);

		const rendered = stripAnsi(component.render(100).join("\n"));
		expect(rendered).toContain("Working…");
		expect(rendered).toContain("Queued: also check technology news");

		component.handleInput("\r");
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
