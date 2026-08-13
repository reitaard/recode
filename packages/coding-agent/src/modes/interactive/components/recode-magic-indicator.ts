import type { LoaderIndicatorOptions } from "@reitaard/recode-tui";
import { theme } from "../theme/theme.ts";

const ENCRYPTED_FRAME_INTERVAL_MS = 50;
const SCRAMBLE_WIDTH = 10;
const LOOP_FRAME_COUNT = 32;
const ELLIPSIS_FRAME_DURATION = 8;
const READABLE_HOLD_FRAMES = 80;
const TRANSITION_FRAME_COUNT = 30;
const SCRAMBLE_CHARSET = "0123456789abcdefABCDEF~!@#$£€%^&*()+=_";
const ELLIPSIS_FRAMES = [".", "..", "...", ""];
const LOADER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const RECODE_SPINNER_VERBS = [
	"Nucleating",
	"Cooking",
	"Percolating",
	"Recombobulating",
	"Nebulizing",
	"Hyperspacing",
	"Quantumizing",
	"Synthesizing",
	"Transmuting",
	"Crystallizing",
	"Germinating",
	"Incubating",
	"Orchestrating",
	"Computing",
	"Calculating",
	"Processing",
	"Puzzling",
	"Tinkering",
	"Crafting",
	"Forging",
	"Brewing",
	"Simmering",
	"Concocting",
	"Deciphering",
	"Cerebrating",
	"Channelling",
	"Cogitating",
	"Contemplating",
	"Elucidating",
	"Envisioning",
	"Finagling",
	"Flibbertigibbeting",
	"Hatching",
	"Herding",
	"Honking",
	"Ideating",
	"Imagining",
	"Manifesting",
	"Marinating",
	"Meandering",
	"Moseying",
	"Mulling",
	"Mustering",
	"Musing",
	"Noodling",
	"Philosophising",
	"Pontificating",
	"Ruminating",
] as const;

let previousSpinnerVerb = -1;

export const RECODE_LIME_PALETTE = [
	{ hex: "#45ED7A", ansi256: 114 },
	{ hex: "#34AD61", ansi256: 71 },
	{ hex: "#257B4A", ansi256: 29 },
] as const;

export const RECODE_LIGHT_LIME_PALETTE = [
	{ hex: "#1B754E", ansi256: 29 },
	{ hex: "#247A45", ansi256: 29 },
	{ hex: "#2F6B3D", ansi256: 22 },
] as const;

export function selectRecodeSpinnerVerb(random: () => number = Math.random): string {
	let index = Math.min(RECODE_SPINNER_VERBS.length - 1, Math.floor(random() * RECODE_SPINNER_VERBS.length));
	if (index === previousSpinnerVerb) index = (index + 1) % RECODE_SPINNER_VERBS.length;
	previousSpinnerVerb = index;
	return RECODE_SPINNER_VERBS[index] ?? RECODE_SPINNER_VERBS[0];
}

/** Creates one continuous verb-to-encrypted animation with a full-speed loop tail. */
export function createRecodeMagicIndicator(verb: string, random: () => number = Math.random): LoaderIndicatorOptions {
	const introFrames: string[] = [];
	for (let frameIndex = 0; frameIndex < READABLE_HOLD_FRAMES; frameIndex++) {
		const loader = LOADER_FRAMES[frameIndex % LOADER_FRAMES.length] ?? "⠋";
		const ellipsis = ELLIPSIS_FRAMES[Math.floor(frameIndex / 5) % ELLIPSIS_FRAMES.length] ?? "";
		introFrames.push(`${recodeSpinner(loader)} ${recodeSpinner(`${verb}${ellipsis}`)}`);
	}

	for (let transitionFrame = 0; transitionFrame < TRANSITION_FRAME_COUNT; transitionFrame++) {
		const progress = transitionFrame / (TRANSITION_FRAME_COUNT - 1);
		const visibleCharacters = Math.round(verb.length * (1 - progress));
		const width = Math.round(verb.length + (SCRAMBLE_WIDTH - verb.length) * progress);
		const plain = verb.slice(0, Math.min(visibleCharacters, width));
		const encryptedWidth = Math.max(0, width - plain.length);
		const encryptedCharacters = createEncryptedCharacters(encryptedWidth, random);
		const encrypted = colorEncryptedCharacters(encryptedCharacters, transitionFrame);
		const absoluteFrame = READABLE_HOLD_FRAMES + transitionFrame;
		const loader = LOADER_FRAMES[absoluteFrame % LOADER_FRAMES.length] ?? "⠋";
		introFrames.push(`${recodeSpinner(loader)} ${recodeSpinner(plain)}${encrypted}`);
	}

	const loopFrames = createEncryptedLoopFrames(random, introFrames.length);
	return {
		frames: [...introFrames, ...loopFrames],
		intervalMs: ENCRYPTED_FRAME_INTERVAL_MS,
		loopFromFrame: introFrames.length,
	};
}

/** Creates a Crush-style encrypted band with a green spinner and lime ellipsis. */
export function createRecodeGeneratingLoop(random: () => number = Math.random): LoaderIndicatorOptions {
	return { frames: createEncryptedLoopFrames(random), intervalMs: ENCRYPTED_FRAME_INTERVAL_MS };
}

function createEncryptedLoopFrames(random: () => number, frameOffset = 0): string[] {
	return Array.from({ length: LOOP_FRAME_COUNT }, (_, frameIndex) => {
		const loader = LOADER_FRAMES[frameIndex % LOADER_FRAMES.length] ?? "⠋";
		const encryptedBand = createEncryptedBand(SCRAMBLE_WIDTH, frameIndex + frameOffset, random);
		const ellipsisIndex = Math.floor(frameIndex / ELLIPSIS_FRAME_DURATION) % ELLIPSIS_FRAMES.length;
		const ellipsis = ELLIPSIS_FRAMES[ellipsisIndex] ?? "";
		return `${recodeSpinner(loader)} ${encryptedBand}${limeText(ellipsis, frameIndex)}`;
	});
}

function createEncryptedBand(width: number, paletteOffset: number, random: () => number): string {
	return colorEncryptedCharacters(createEncryptedCharacters(width, random), paletteOffset);
}

function createEncryptedCharacters(width: number, random: () => number): string[] {
	return Array.from({ length: width }, () => {
		const characterIndex = Math.floor(random() * SCRAMBLE_CHARSET.length);
		return SCRAMBLE_CHARSET[characterIndex] ?? ".";
	});
}

function colorEncryptedCharacters(characters: string[], paletteOffset: number): string {
	return characters.map((character, index) => limeFg(character, index + paletteOffset)).join("");
}

export function recodeSpinner(text: string): string {
	return limeFg(text, 0);
}

function limeText(text: string, paletteOffset: number): string {
	return [...text].map((character, index) => limeFg(character, paletteOffset + index)).join("");
}

function limeFg(text: string, paletteIndex: number): string {
	const palette = theme.name === "light" ? RECODE_LIGHT_LIME_PALETTE : RECODE_LIME_PALETTE;
	const color = palette[paletteIndex % palette.length] ?? palette[0];
	const ansi =
		theme.getColorMode() === "truecolor"
			? `\x1b[38;2;${Number.parseInt(color.hex.slice(1, 3), 16)};${Number.parseInt(color.hex.slice(3, 5), 16)};${Number.parseInt(color.hex.slice(5, 7), 16)}m`
			: `\x1b[38;5;${color.ansi256}m`;
	return `${ansi}${text}\x1b[39m`;
}
