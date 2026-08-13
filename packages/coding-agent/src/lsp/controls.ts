export type LspControlCommand =
	| { target: "lsp"; action: "status" | "enable" | "disable" }
	| { target: "lsp"; action: "server"; server: string; enabled: boolean }
	| { target: "lsp"; action: "project-only"; enabled: boolean }
	| { target: "lspmux"; action: "status" | "enable" | "disable" };

function parseToggle(value: string): boolean | null {
	if (value === "on" || value === "enable" || value === "enabled") return true;
	if (value === "off" || value === "disable" || value === "disabled") return false;
	return null;
}

export function parseLspControlCommand(text: string): LspControlCommand | null {
	const parts = text.trim().split(/\s+/);
	const command = parts[0];
	if (command !== "/lsp" && command !== "/lspmux") return null;
	const target = command === "/lsp" ? "lsp" : "lspmux";
	if (parts.length === 1 || parts[1] === "status") return { target, action: "status" };
	const toggle = parseToggle(parts[1]);
	if (toggle !== null && parts.length === 2) {
		return { target, action: toggle ? "enable" : "disable" };
	}
	if (target === "lsp" && parts[1] === "server" && parts.length === 4) {
		const enabled = parseToggle(parts[3]);
		if (enabled !== null && parts[2]) return { target, action: "server", server: parts[2], enabled };
	}
	if (target === "lsp" && parts[1] === "project-only" && parts.length === 3) {
		const enabled = parseToggle(parts[2]);
		if (enabled !== null) return { target: "lsp", action: "project-only", enabled };
	}
	if (target === "lsp" && parts.length === 2 && (parts[1] === "project-on" || parts[1] === "project-off")) {
		return { target: "lsp", action: "project-only", enabled: parts[1] === "project-on" };
	}
	return null;
}

export const LSP_CONTROL_USAGE =
	"Usage: /lsp [status|on|off|project-on|project-off|project-only on|off|server <name> on|off]";
export const LSPMUX_CONTROL_USAGE = "Usage: /lspmux [status|on|off]";
