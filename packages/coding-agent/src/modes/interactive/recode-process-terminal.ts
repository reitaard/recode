import { ProcessTerminal, type Terminal } from "@reitaard/recode-tui";
import { emitStartupMilestone, isStartupProbeEnabled } from "../../core/startup-probe.ts";
import { resetRecodeTerminalBackground } from "./recode-terminal-background.ts";

interface WindowSizeSource {
	getWindowSize?: () => [number, number];
}

export function readCurrentWindowSize(
	source: WindowSizeSource = process.stdout,
): readonly [number, number] | undefined {
	try {
		const size = source.getWindowSize?.();
		if (size && size[0] > 0 && size[1] > 0) {
			return size;
		}
	} catch {
		// Fall through to ProcessTerminal's cached dimensions.
	}
	return undefined;
}

type StartupTerminal = Pick<Terminal, "clearScreen" | "write">;

/** Clears stale shell content and anchors the first re.code render at the viewport origin. */
export function prepareRecodeTerminalViewport(terminal: StartupTerminal): void {
	resetRecodeTerminalBackground(terminal);
	terminal.clearScreen();
}

/** Process terminal that owns the re.code background lifecycle. */
export class RecodeProcessTerminal extends ProcessTerminal {
	override get columns(): number {
		return readCurrentWindowSize()?.[0] ?? super.columns;
	}

	override get rows(): number {
		return readCurrentWindowSize()?.[1] ?? super.rows;
	}

	override start(onInput: (data: string) => void, onResize: () => void): void {
		super.start(onInput, onResize);
		prepareRecodeTerminalViewport(this);
	}

	override write(data: string): void {
		super.write(data);
		const expectedInput = process.env.PI_STARTUP_BENCHMARK_INPUT;
		if (isStartupProbeEnabled() && expectedInput && data.includes(expectedInput)) {
			emitStartupMilestone("tui-input-echo");
		}
	}

	override stop(): void {
		resetRecodeTerminalBackground(this);
		super.stop();
	}
}
