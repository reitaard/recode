import { describe, expect, it } from "vitest";
import { getRecodeSessionReference } from "../src/core/recode-session-identity.ts";

describe("Recode session references", () => {
	it("uses the session date, explicit name, and a short internal id", () => {
		expect(
			getRecodeSessionReference({
				id: "019f6b81-2694-767a-8d3a-b712fd8ce0f2",
				timestamp: "2026-07-16T15:17:33.973Z",
				cwd: "/root/src/crush",
				name: "VPS Cleanup & Review",
			}),
		).toBe("2026-07-16-vps-cleanup-review-019f6b81");
	});

	it("falls back to a cross-platform project directory name", () => {
		expect(
			getRecodeSessionReference({
				id: "abcdef12-3456",
				timestamp: "2026-07-17T01:00:00.000Z",
				cwd: "C:\\Users\\re_Lax\\Desktop\\chat7\\re.pi",
			}),
		).toBe("2026-07-17-re-pi-abcdef12");
		expect(getRecodeSessionReference({ id: "session-id", timestamp: "invalid", cwd: "/" })).toBe(
			"undated-root-sessioni",
		);
	});
});
