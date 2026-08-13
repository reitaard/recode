import { describe, expect, test } from "vitest";
import { LspMessageFramer } from "../src/lsp/message-framer.ts";

function frame(value: unknown): Buffer {
	const body = JSON.stringify(value);
	return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

describe("LspMessageFramer", () => {
	test("waits for a split message and decodes it once complete", () => {
		const framer = new LspMessageFramer();
		const encoded = frame({ jsonrpc: "2.0", id: 1, result: true });
		expect(framer.push(encoded.subarray(0, 12))).toEqual([]);
		expect(framer.push(encoded.subarray(12))).toEqual(['{"jsonrpc":"2.0","id":1,"result":true}']);
	});

	test("drains multiple framed messages from one chunk", () => {
		const framer = new LspMessageFramer();
		expect(framer.push(Buffer.concat([frame({ id: 1 }), frame({ id: 2 })]))).toEqual(['{"id":1}', '{"id":2}']);
	});
});
