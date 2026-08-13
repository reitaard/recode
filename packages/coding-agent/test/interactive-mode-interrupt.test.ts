import { describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

type InterruptKind = "retry" | "compaction" | "branchSummary";

type InterruptFixture = {
	activeStatusIndicator: { kind: InterruptKind } | undefined;
	isRuntimeCompacting: boolean;
	isAgentRunning: boolean;
	abortCompactionRuntime: ReturnType<typeof vi.fn>;
	abortRetryRuntime: ReturnType<typeof vi.fn>;
	restoreQueuedMessagesToEditor: ReturnType<typeof vi.fn>;
	session: {
		abortBranchSummary: ReturnType<typeof vi.fn>;
		abortBash: ReturnType<typeof vi.fn>;
		isBashRunning: boolean;
	};
	isBashMode: boolean;
	editor: { getText: () => string; setText: ReturnType<typeof vi.fn> };
	updateEditorBorderColor: ReturnType<typeof vi.fn>;
	settingsManager: { getDoubleEscapeAction: () => "none" };
	lastEscapeTime: number;
	showTreeSelector: ReturnType<typeof vi.fn>;
	showUserMessageSelector: ReturnType<typeof vi.fn>;
};

const handleInterrupt = Reflect.get(InteractiveMode.prototype, "handleInterrupt") as (this: InterruptFixture) => void;

function createFixture(kind: InterruptKind): InterruptFixture {
	return {
		activeStatusIndicator: { kind },
		isRuntimeCompacting: false,
		isAgentRunning: true,
		abortCompactionRuntime: vi.fn(),
		abortRetryRuntime: vi.fn(),
		restoreQueuedMessagesToEditor: vi.fn(),
		session: {
			abortBranchSummary: vi.fn(),
			abortBash: vi.fn(),
			isBashRunning: false,
		},
		isBashMode: false,
		editor: { getText: () => "", setText: vi.fn() },
		updateEditorBorderColor: vi.fn(),
		settingsManager: { getDoubleEscapeAction: () => "none" },
		lastEscapeTime: 0,
		showTreeSelector: vi.fn(),
		showUserMessageSelector: vi.fn(),
	};
}

describe("InteractiveMode interrupt routing", () => {
	test.each([
		["compaction", "abortCompactionRuntime"],
		["retry", "abortRetryRuntime"],
		["branchSummary", "abortBranchSummary"],
	] as const)("routes Escape for %s without falling through to agent abort", (kind, expected) => {
		const fixture = createFixture(kind);

		handleInterrupt.call(fixture);

		if (expected === "abortBranchSummary") {
			expect(fixture.session.abortBranchSummary).toHaveBeenCalledOnce();
		} else {
			expect(fixture[expected]).toHaveBeenCalledOnce();
		}
		expect(fixture.restoreQueuedMessagesToEditor).not.toHaveBeenCalled();
	});

	test.each(["retry", "compaction"] as const)("routes Aizen %s cancellation to the Aizen runtime", (kind) => {
		const runtimeAbort = vi.fn(async () => {});
		const legacyAbort = vi.fn();
		const methodName = kind === "retry" ? "abortRetryRuntime" : "abortCompactionRuntime";
		const runtimeMethod = Reflect.get(InteractiveMode.prototype, methodName) as (this: {
			aizenRuntime: { abortRetry: () => void; abortCompaction: () => Promise<void> } | undefined;
			session: { abortRetry: () => void; abortCompaction: () => void };
		}) => void;

		runtimeMethod.call({
			aizenRuntime: { abortRetry: runtimeAbort, abortCompaction: runtimeAbort },
			session: { abortRetry: legacyAbort, abortCompaction: legacyAbort },
		});

		expect(runtimeAbort).toHaveBeenCalledOnce();
		expect(legacyAbort).not.toHaveBeenCalled();
	});

	test.each(["retry", "compaction"] as const)("routes legacy %s cancellation to AgentSession", (kind) => {
		const legacyAbort = vi.fn();
		const methodName = kind === "retry" ? "abortRetryRuntime" : "abortCompactionRuntime";
		const runtimeMethod = Reflect.get(InteractiveMode.prototype, methodName) as (this: {
			aizenRuntime: undefined;
			session: { abortRetry: () => void; abortCompaction: () => void };
		}) => void;

		runtimeMethod.call({
			aizenRuntime: undefined,
			session: { abortRetry: legacyAbort, abortCompaction: legacyAbort },
		});

		expect(legacyAbort).toHaveBeenCalledOnce();
	});
});
