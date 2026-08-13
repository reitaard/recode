import { describe, expect, it, vi } from "vitest";
import { LifecycleReadiness } from "../src/core/lifecycle-readiness.ts";

describe("LifecycleReadiness", () => {
	it("tracks the five readiness levels independently", () => {
		const readiness = new LifecycleReadiness();
		readiness.beginSession(true);
		readiness.markReady("frame-ready");
		readiness.markReady("input-ready");

		const snapshot = readiness.snapshot();
		expect(snapshot.generation).toBe(1);
		expect(snapshot.levels["frame-ready"].status).toBe("ready");
		expect(snapshot.levels["input-ready"].status).toBe("ready");
		expect(snapshot.levels["session-ready"].status).toBe("ready");
		expect(snapshot.levels["integration-ready"].status).toBe("pending");
		expect(snapshot.levels["model-ready"].status).toBe("ready");
	});

	it("preserves process UI readiness while resetting session-scoped levels", () => {
		const readiness = new LifecycleReadiness();
		readiness.beginSession(true);
		readiness.markReady("frame-ready");
		readiness.markReady("input-ready");
		readiness.markReady("integration-ready");

		readiness.beginSession(false);
		const snapshot = readiness.snapshot();
		expect(snapshot.generation).toBe(2);
		expect(snapshot.levels["frame-ready"].status).toBe("ready");
		expect(snapshot.levels["input-ready"].status).toBe("ready");
		expect(snapshot.levels["session-ready"].status).toBe("ready");
		expect(snapshot.levels["integration-ready"].status).toBe("pending");
		expect(snapshot.levels["model-ready"].status).toBe("pending");
	});

	it("publishes immutable snapshots only for readiness transitions", () => {
		const readiness = new LifecycleReadiness();
		const listener = vi.fn();
		readiness.onChange(listener);

		readiness.markReady("frame-ready");
		expect(readiness.markReady("frame-ready")).toBe(false);
		expect(readiness.markPending("input-ready")).toBe(false);
		expect(listener).toHaveBeenCalledTimes(1);

		const snapshot = listener.mock.calls[0]?.[0];
		snapshot.levels["frame-ready"].status = "pending";
		expect(readiness.isReady("frame-ready")).toBe(true);
	});
});
