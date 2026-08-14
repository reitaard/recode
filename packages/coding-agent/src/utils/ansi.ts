/*
 * Portions of this file are derived from:
 * - ansi-regex (https://github.com/chalk/ansi-regex)
 * - strip-ansi (https://github.com/chalk/strip-ansi)
 *
 * MIT License
 *
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

function ansiRegex({ onlyFirst = false }: { onlyFirst?: boolean } = {}): RegExp {
	// Valid string terminator sequences are BEL, ESC\, and 0x9c
	const ST = "(?:\\u0007|\\u001B\\u005C|\\u009C)";

	// OSC sequences only: ESC ] ... ST (non-greedy until the first ST)
	const osc = `(?:\\u001B\\][\\s\\S]*?${ST})`;

	// CSI and related: ESC/C1, optional intermediates, optional params (supports ; and :) then final byte
	const csi = "[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]";

	const pattern = `${osc}|${csi}`;

	return new RegExp(pattern, onlyFirst ? undefined : "g");
}

const regex = ansiRegex();

const SGR_SEQUENCE = /^(?:\u001B\[|\u009B)[0-9;:]*m$/;

/**
 * Retain only SGR styling from streamed terminal output. Incomplete control
 * sequences are buffered across chunks so unsafe controls cannot leak when a
 * process splits an escape sequence between writes.
 */
export class SgrStreamSanitizer {
	private pending = "";

	push(chunk: string): string {
		const value = this.pending + chunk;
		this.pending = "";
		let output = "";
		let cursor = 0;

		while (cursor < value.length) {
			const escapeIndex = value.slice(cursor).search(/[\u001B\u009B]/);
			if (escapeIndex < 0) return output + value.slice(cursor);
			const start = cursor + escapeIndex;
			output += value.slice(cursor, start);
			const introducer = value[start];

			if (introducer === "\u001B" && start + 1 >= value.length) {
				this.pending = value.slice(start);
				return output;
			}

			if (introducer === "\u001B" && value[start + 1] === "]") {
				const tail = value.slice(start + 2);
				const terminator = tail.search(/\u0007|\u009C|\u001B\\/);
				if (terminator < 0) {
					this.pending = value.slice(start);
					return output;
				}
				const terminatorLength = tail.startsWith("\u001B\\", terminator) ? 2 : 1;
				cursor = start + 2 + terminator + terminatorLength;
				continue;
			}

			const isCsi = introducer === "\u009B" || value[start + 1] === "[";
			if (isCsi) {
				const bodyStart = start + (introducer === "\u009B" ? 1 : 2);
				let end = bodyStart;
				while (end < value.length && !(value.charCodeAt(end) >= 0x40 && value.charCodeAt(end) <= 0x7e)) end++;
				if (end >= value.length) {
					this.pending = value.slice(start);
					return output;
				}
				const sequence = value.slice(start, end + 1);
				if (SGR_SEQUENCE.test(sequence)) output += sequence;
				cursor = end + 1;
				continue;
			}

			// Discard a non-CSI two-byte escape sequence.
			cursor = Math.min(value.length, start + 2);
		}

		return output;
	}

	finish(): string {
		this.pending = "";
		return "";
	}
}

export function stripAnsi(value: string): string {
	if (typeof value !== "string") {
		throw new TypeError(`Expected a \`string\`, got \`${typeof value}\``);
	}

	// Fast path: ANSI codes require ESC (7-bit) or CSI (8-bit) introducer
	if (!value.includes("\u001B") && !value.includes("\u009B")) {
		return value;
	}

	// Even though the regex is global, we don't need to reset the `.lastIndex`
	// because unlike `.exec()` and `.test()`, `.replace()` does it automatically
	// and doing it manually has a performance penalty.
	return value.replace(regex, "");
}
