import type { Terminal } from "@reitaard/recode-tui";

const RESET_TERMINAL_BACKGROUND = "\x1b]111\x07";

type WritableTerminal = Pick<Terminal, "write">;

/** Restores the terminal profile's configured background color. */
export function resetRecodeTerminalBackground(terminal: WritableTerminal): void {
	terminal.write(RESET_TERMINAL_BACKGROUND);
}
