import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "../src/core/extensions/types.ts";
import { wrapToolDefinition } from "../src/core/tools/tool-definition-wrapper.ts";

const parameters = Type.Object({
	responseId: Type.String(),
	query: Type.Optional(Type.String()),
	queryIndex: Type.Optional(Type.Number()),
	url: Type.Optional(Type.String()),
	urlIndex: Type.Optional(Type.Number()),
	offset: Type.Optional(Type.Number()),
	limit: Type.Optional(Type.Number()),
	findText: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
	findMode: Type.Optional(Type.String()),
});

function createTool(name = "get_search_content"): ToolDefinition<typeof parameters> {
	return {
		name,
		label: name,
		description: "test tool",
		parameters,
		async execute() {
			return { content: [{ type: "text", text: "ok" }], details: {} };
		},
	};
}

describe("extension tool argument compatibility", () => {
	it("removes injected selectors and pagination from get_search_content finder calls", () => {
		const tool = wrapToolDefinition(createTool());

		expect(
			tool.prepareArguments?.({
				responseId: "stored-result",
				query: "",
				queryIndex: 0,
				url: "",
				urlIndex: 0,
				offset: 0,
				limit: 30_000,
				findText: "installation",
				findMode: "case-insensitive",
			}),
		).toEqual({
			responseId: "stored-result",
			queryIndex: 0,
			urlIndex: 0,
			findText: "installation",
			findMode: "case-insensitive",
		});
	});

	it("preserves pagination when an injected empty finder is unused", () => {
		const tool = wrapToolDefinition(createTool());

		expect(
			tool.prepareArguments?.({
				responseId: "stored-result",
				url: "https://example.com",
				offset: 30_000,
				limit: 5_000,
				findText: "",
				findMode: "case-insensitive",
			}),
		).toEqual({
			responseId: "stored-result",
			url: "https://example.com",
			offset: 30_000,
			limit: 5_000,
		});
	});

	it("does not add argument preparation to unrelated tools", () => {
		const tool = wrapToolDefinition(createTool("other_tool"));
		expect(tool.prepareArguments).toBeUndefined();
	});
});
