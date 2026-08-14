import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMaestroChildEnvironment } from "../src/child-environment.ts";

describe("Maestro child environment policy", () => {
	it("keeps runtime and provider variables while removing unrelated ambient secrets", () => {
		const result = createMaestroChildEnvironment(
			{
				PATH: "/bin",
				HOME: "/home/creator",
				OPENAI_API_KEY: "provider-secret",
				PI_CODING_AGENT_DIR: "/tmp/agent",
				GITHUB_PAT_TOKEN: "unrelated-secret",
				NPM_TOKEN: "supply-chain-secret",
				NODE_OPTIONS: "--require=/tmp/inject.js",
				RECODE_MAESTRO_CHILD_ENV_ALLOW: "CUSTOM_MCP_TOKEN",
				CUSTOM_MCP_TOKEN: "explicit-secret",
			},
			"read-only",
		);
		assert.equal(result.PATH, "/bin");
		assert.equal(result.HOME, "/home/creator");
		assert.equal(result.OPENAI_API_KEY, "provider-secret");
		assert.equal(result.PI_CODING_AGENT_DIR, "/tmp/agent");
		assert.equal(result.CUSTOM_MCP_TOKEN, "explicit-secret");
		assert.equal(result.RECODE_WORKSPACE_ACCESS, "read-only");
		assert.equal(result.GITHUB_PAT_TOKEN, undefined);
		assert.equal(result.NPM_TOKEN, undefined);
		assert.equal(result.NODE_OPTIONS, undefined);
		assert.equal(result.RECODE_MAESTRO_CHILD_ENV_ALLOW, undefined);
	});

	it("reads legacy names as fallbacks but emits only Recode names", () => {
		const result = createMaestroChildEnvironment(
			{
				REPI_DELEGATION: "0",
				REPI_MAESTRO_CHILD_ENV_ALLOW: "LEGACY_ALLOWED",
				LEGACY_ALLOWED: "value",
			},
			"write",
		);
		assert.equal(result.RECODE_DELEGATION, "0");
		assert.equal(result.RECODE_WORKSPACE_ACCESS, "write");
		assert.equal(result.LEGACY_ALLOWED, "value");
		assert.equal(result.REPI_DELEGATION, undefined);
		assert.equal(result.REPI_WORKSPACE_ACCESS, undefined);
	});

	it("prefers authoritative Recode values over legacy fallbacks", () => {
		const result = createMaestroChildEnvironment({ RECODE_DELEGATION: "1", REPI_DELEGATION: "0" }, "read-only");
		assert.equal(result.RECODE_DELEGATION, "1");
		assert.equal(result.REPI_DELEGATION, undefined);
	});

	it("rejects malformed explicit allowlists", () => {
		assert.throws(
			() =>
				createMaestroChildEnvironment(
					{ RECODE_MAESTRO_CHILD_ENV_ALLOW: "GOOD,not-valid-name!", GOOD: "value" },
					"write",
				),
			/at most 64 comma-separated environment names/,
		);
	});
});
