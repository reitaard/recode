import * as fs from "node:fs";
import * as path from "node:path";

/** JSON-safe fields recorded in a TUI diagnostic event. */
export type TuiDiagnosticValue = boolean | number | string | null;
export type TuiDiagnosticFields = Readonly<Record<string, TuiDiagnosticValue>>;

const MAX_DIAGNOSTIC_LOG_BYTES = 2 * 1024 * 1024;
const MAX_DIAGNOSTIC_FIELD_LENGTH = 4_000;

function sanitizeText(value: string): string {
	return value
		.replace(/((?:api[_-]?key|authorization|password|secret|token)\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
		.replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
		.slice(0, MAX_DIAGNOSTIC_FIELD_LENGTH);
}

function normalizeField(value: TuiDiagnosticValue): TuiDiagnosticValue {
	return typeof value === "string" ? sanitizeText(value) : value;
}

/**
 * Append one bounded JSONL diagnostic event without allowing diagnostics to
 * interfere with the TUI. Callers should record metadata, not session content.
 */
export function writeTuiDiagnostic(logPath: string | undefined, kind: string, fields: TuiDiagnosticFields = {}): void {
	if (!logPath) return;

	try {
		const safeFields: Record<string, TuiDiagnosticValue> = {};
		for (const [key, value] of Object.entries(fields)) {
			safeFields[key] = normalizeField(value);
		}

		const line = `${JSON.stringify({
			timestamp: new Date().toISOString(),
			kind: sanitizeText(kind),
			...safeFields,
		})}\n`;
		fs.mkdirSync(path.dirname(logPath), { recursive: true });

		let currentSize = 0;
		try {
			currentSize = fs.statSync(logPath).size;
		} catch {
			// The file does not exist yet.
		}

		if (currentSize + Buffer.byteLength(line, "utf8") > MAX_DIAGNOSTIC_LOG_BYTES) {
			fs.writeFileSync(logPath, line, { encoding: "utf8" });
		} else {
			fs.appendFileSync(logPath, line, { encoding: "utf8" });
		}
	} catch {
		// Diagnostics are best effort and must never crash or stall the TUI.
	}
}
