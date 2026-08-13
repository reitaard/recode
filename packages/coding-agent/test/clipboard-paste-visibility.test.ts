import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	readClipboardImage: vi.fn(),
	readClipboardTextWithStatus: vi.fn(),
	ClipboardImageDecodeError: class MockClipboardImageDecodeError extends Error {
		readonly kind = "decode-error" as const;
	},
}));

vi.mock("../src/utils/clipboard.ts", () => ({
	copyToClipboard: vi.fn(),
	readClipboardTextWithStatus: mocks.readClipboardTextWithStatus,
}));

vi.mock("../src/utils/clipboard-image.ts", () => ({
	ClipboardImageDecodeError: mocks.ClipboardImageDecodeError,
	extensionForImageMimeType: vi.fn(() => "png"),
	readClipboardImage: mocks.readClipboardImage,
}));

import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

type ClipboardPasteContext = {
	editor: { insertTextAtCursor?: (text: string) => void };
	ui: { requestRender: () => void };
	showError: (message: string) => void;
};

type ClipboardPasteMethod = (this: ClipboardPasteContext) => Promise<void>;
const handleClipboardPaste = (InteractiveMode.prototype as unknown as { handleClipboardPaste: ClipboardPasteMethod })
	.handleClipboardPaste;

describe("Recode clipboard paste visibility", () => {
	beforeEach(() => {
		mocks.readClipboardImage.mockReset();
		mocks.readClipboardTextWithStatus.mockReset();
	});

	function createContext(): ClipboardPasteContext {
		return {
			editor: { insertTextAtCursor: vi.fn() },
			ui: { requestRender: vi.fn() },
			showError: vi.fn(),
		};
	}

	test("reports an empty clipboard", async () => {
		mocks.readClipboardImage.mockResolvedValue(null);
		mocks.readClipboardTextWithStatus.mockResolvedValue({ status: "empty" });
		const context = createContext();

		await handleClipboardPaste.call(context);

		expect(context.showError).toHaveBeenCalledWith(expect.stringContaining("no image or text"));
	});

	test("reports clipboard read failures", async () => {
		mocks.readClipboardImage.mockRejectedValue(new Error("permission denied"));
		const context = createContext();

		await handleClipboardPaste.call(context);

		expect(context.showError).toHaveBeenCalledWith(expect.stringContaining("Could not read the clipboard"));
	});

	test("reports image decode failures", async () => {
		mocks.readClipboardImage.mockRejectedValue(new mocks.ClipboardImageDecodeError());
		const context = createContext();

		await handleClipboardPaste.call(context);

		expect(context.showError).toHaveBeenCalledWith(expect.stringContaining("Could not decode the clipboard image"));
	});
});
