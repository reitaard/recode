import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@reitaard/recode-ai/compat";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAgentSession } from "../src/core/sdk.ts";
import { SessionManager } from "../src/core/session-manager.ts";

describe("Aizen runtime profile", () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("exposes only the locked current model, prompt, tools, and queue modes", async () => {
		const root = join(tmpdir(), `repi-aizen-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		roots.push(root);
		mkdirSync(join(root, "skills", "audit"), { recursive: true });
		mkdirSync(join(root, "prompts"), { recursive: true });
		writeFileSync(
			join(root, "skills", "audit", "SKILL.md"),
			"---\nname: audit\ndescription: Audit the current code\n---\nAudit carefully.",
		);
		writeFileSync(join(root, "prompts", "review.md"), "---\ndescription: Review a target\n---\nReview $ARGUMENTS");
		const model = getModel("anthropic", "claude-sonnet-4-5");
		expect(model).toBeTruthy();

		const { session } = await createAgentSession({
			cwd: root,
			agentDir: root,
			model: model!,
			thinkingLevel: "low",
			tools: ["read"],
			sessionManager: SessionManager.inMemory(root),
		});
		const beforeAgentStart = vi.spyOn(session.extensionRunner, "emitBeforeAgentStart").mockResolvedValue({
			systemPrompt: "Prepared prompt",
			messages: [
				{
					customType: "profile-context",
					content: [{ type: "text", text: "Prepared context" }],
					display: true,
				},
			],
		});

		const profile = session.createAizenRuntimeProfile();
		expect(profile.model).toBe(model);
		expect(profile.thinkingLevel).toBe("low");
		expect(profile.activeToolNames).toEqual(["read"]);
		expect(profile.tools.map((tool) => tool.name)).toEqual(["read"]);
		expect(profile.systemPrompt).toContain("You are Aizen (藍染), Recode's main coding agent and Manager.");
		expect(profile.steeringMode).toBe(session.steeringMode);
		expect(profile.followUpMode).toBe(session.followUpMode);
		expect(profile.resources.promptTemplates).toEqual([
			expect.objectContaining({ name: "review", description: "Review a target", content: "Review $ARGUMENTS" }),
		]);
		expect(profile.resources.skills).toEqual([
			expect.objectContaining({
				name: "audit",
				description: "Audit the current code",
				content: expect.stringContaining("Audit carefully."),
			}),
		]);
		await expect(
			profile.hooks.beforeAgentStart({
				type: "before_agent_start",
				prompt: "Inspect the project",
				systemPrompt: profile.systemPrompt,
				resources: profile.resources,
			}),
		).resolves.toMatchObject({
			systemPrompt: "Prepared prompt",
			messages: [
				{
					role: "custom",
					customType: "profile-context",
					content: [{ type: "text", text: "Prepared context" }],
					display: true,
				},
			],
		});
		expect(beforeAgentStart).toHaveBeenCalledWith(
			"Inspect the project",
			undefined,
			profile.systemPrompt,
			expect.objectContaining({ cwd: root }),
		);

		profile.tools.length = 0;
		expect(session.getActiveToolNames()).toEqual(["read"]);
		session.dispose();
	});
});
