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
				REPI_MAESTRO_CHILD_ENV_ALLOW: "CUSTOM_MCP_TOKEN",
				CUSTOM_MCP_TOKEN: "explicit-secret",
			},
			"read-only",
		);
		assert.equal(result.PATH, "/bin");
		assert.equal(result.HOME, "/home/creator");
		assert.equal(result.OPENAI_API_KEY, "provider-secret");
		assert.equal(result.PI_CODING_AGENT_DIR, "/tmp/agent");
		assert.equal(result.CUSTOM_MCP_TOKEN, "explicit-secret");
		assert.equal(result.REPI_WORKSPACE_ACCESS, "read-only");
		assert.equal(result.GITHUB_PAT_TOKEN, undefined);
		assert.equal(result.NPM_TOKEN, undefined);
		assert.equal(result.NODE_OPTIONS, undefined);
		assert.equal(result.REPI_MAESTRO_CHILD_ENV_ALLOW, undefined);
	});

	it("rejects malformed explicit allowlists", () => {
		assert.throws(
			() =>
				createMaestroChildEnvironment(
					{ REPI_MAESTRO_CHILD_ENV_ALLOW: "GOOD,not-valid-name!", GOOD: "value" },
					"write",
				),
			/at most 64 comma-separated environment names/,
		);
	});
});
