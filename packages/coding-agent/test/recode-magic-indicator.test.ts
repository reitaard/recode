import { resetCapabilitiesCache, setCapabilities } from "@reitaard/recode-tui";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
	createRecodeGeneratingLoop,
	createRecodeMagicIndicator,
	RECODE_LIGHT_LIME_PALETTE,
	RECODE_LIME_PALETTE,
	RECODE_SPINNER_VERBS,
	recodeSpinner,
} from "../src/modes/interactive/components/recode-magic-indicator.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

describe("re.code generating animation", () => {
	beforeAll(() => {
		initTheme(undefined, false);
	});

	afterEach(() => {
		resetCapabilitiesCache();
		initTheme(undefined, false);
	});

	it("plays a sourced verb once before looping only the encrypted tail", () => {
		const loader = createRecodeMagicIndicator("Nucleating", () => 0.25);
		const frames = loader.frames?.map((frame) => stripAnsi(frame)) ?? [];

		expect(RECODE_SPINNER_VERBS).toHaveLength(48);
		expect(RECODE_SPINNER_VERBS).not.toContain("Working");
		expect(loader.intervalMs).toBe(50);
		expect(loader.loopFromFrame).toBeGreaterThan(0);
		expect(frames[0]).toContain("Nucleating");
		expect(frames.slice(loader.loopFromFrame)).not.toContainEqual(expect.stringContaining("Nucleating"));
		expect(frames.slice(0, 80).every((frame) => /Nucleating\.{0,3}$/.test(frame))).toBe(true);
		expect(frames.slice(0, 80).some((frame) => frame.endsWith("Nucleating."))).toBe(true);
		expect(frames.slice(0, 80).some((frame) => frame.endsWith("Nucleating.."))).toBe(true);
		expect(frames.slice(0, 80).some((frame) => frame.endsWith("Nucleating..."))).toBe(true);
		expect(new Set(frames.slice(0, 80)).size).toBeGreaterThan(1);
		expect(frames.slice(80, loader.loopFromFrame).some((frame) => frame.includes("Nucleat"))).toBe(true);
		expect(frames.slice(80, loader.loopFromFrame).some((frame) => !frame.includes("Nucleating"))).toBe(true);
	});

	it("loops a three-shade lime encrypted band without a Generating label", () => {
		const loop = createRecodeGeneratingLoop(() => 0.25);
		const frames = loop.frames?.map((frame) => stripAnsi(frame)) ?? [];

		expect(RECODE_LIME_PALETTE.map((color) => color.hex)).toEqual(["#45ED7A", "#34AD61", "#257B4A"]);
		expect(loop.intervalMs).toBe(50);
		expect(frames).toHaveLength(32);
		for (const frame of frames) {
			const [spinner, encryptedBand, extra] = frame.split(" ");
			expect(spinner).toHaveLength(1);
			expect(encryptedBand).toMatch(/^.{10}\.{0,3}$/);
			expect(extra).toBeUndefined();
			expect(frame).not.toContain("Generating");
		}
		expect(frames.some((frame) => frame.endsWith("..."))).toBe(true);
	});

	it("uses darker animation colors in light mode", () => {
		setCapabilities({ images: null, trueColor: true, hyperlinks: false });
		initTheme("light", false);

		expect(RECODE_LIGHT_LIME_PALETTE.map((color) => color.hex)).toEqual(["#1B754E", "#247A45", "#2F6B3D"]);
		expect(recodeSpinner("x")).toContain("\x1b[38;2;27;117;78m");
	});
});
