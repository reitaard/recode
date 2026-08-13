/** Content-Length JSON-RPC framing used by language servers. */

export class LspMessageFramer {
	private pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);

	push(chunk: Buffer): string[] {
		this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
		const messages: string[] = [];
		while (true) {
			const headerEnd = this.pending.indexOf("\r\n\r\n");
			if (headerEnd === -1) break;
			const header = this.pending.subarray(0, headerEnd).toString("ascii");
			const lengthMatch = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(header);
			if (!lengthMatch) {
				this.pending = this.pending.subarray(headerEnd + 4);
				continue;
			}
			const contentLength = Number.parseInt(lengthMatch[1], 10);
			const bodyStart = headerEnd + 4;
			const bodyEnd = bodyStart + contentLength;
			if (this.pending.length < bodyEnd) break;
			messages.push(this.pending.subarray(bodyStart, bodyEnd).toString("utf-8"));
			this.pending = this.pending.subarray(bodyEnd);
		}
		return messages;
	}
}
