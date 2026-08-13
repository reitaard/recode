import { afterEach, describe, expect, it, vi } from "vitest";
import {
	emitStartupMemoryMilestone,
	emitStartupMilestone,
	STARTUP_MILESTONE_PREFIX,
	waitForStartupMilestone,
} from "../src/core/startup-probe.ts";

describe("startup probe", () => {
	const originalProbeValue = process.env.PI_STARTUP_PROBE;

	afterEach(() => {
		if (originalProbeValue === undefined) {
			delete process.env.PI_STARTUP_PROBE;
		} else {
			process.env.PI_STARTUP_PROBE = originalProbeValue;
		}
		vi.restoreAllMocks();
	});

	it("waits for a later milestone", async () => {
		process.env.PI_STARTUP_PROBE = "1";
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const pending = waitForStartupMilestone("provider-request", 1_000);
		setImmediate(() => emitStartupMilestone("provider-request"));
		await expect(pending).resolves.toBeUndefined();
	});

	it("emits bounded process-memory attribution", () => {
		process.env.PI_STARTUP_PROBE = "1";
		const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		vi.spyOn(process, "memoryUsage").mockReturnValue({
			rss: 100,
			heapTotal: 80,
			heapUsed: 60,
			external: 40,
			arrayBuffers: 20,
		});

		emitStartupMemoryMilestone("package-runtime-ready", { extensionResources: 3 });

		const output = String(write.mock.calls[0]?.[0]);
		expect(JSON.parse(output.slice(STARTUP_MILESTONE_PREFIX.length))).toMatchObject({
			schemaVersion: 1,
			name: "package-runtime-ready",
			details: {
				extensionResources: 3,
				rssBytes: 100,
				heapTotalBytes: 80,
				heapUsedBytes: 60,
				externalBytes: 40,
				arrayBuffersBytes: 20,
			},
		});
	});

	it("emits one structured milestone without session content", () => {
		process.env.PI_STARTUP_PROBE = "1";
		const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

		emitStartupMilestone("session-selected", { restored: true });
		emitStartupMilestone("session-selected", { restored: false });

		expect(write).toHaveBeenCalledTimes(1);
		const output = String(write.mock.calls[0]?.[0]);
		expect(output.startsWith(STARTUP_MILESTONE_PREFIX)).toBe(true);
		expect(JSON.parse(output.slice(STARTUP_MILESTONE_PREFIX.length))).toMatchObject({
			schemaVersion: 1,
			name: "session-selected",
			details: { restored: true },
		});
	});
});
