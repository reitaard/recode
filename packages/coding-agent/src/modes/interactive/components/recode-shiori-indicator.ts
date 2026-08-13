import type { LoaderIndicatorOptions } from "@reitaard/recode-tui";
import { RECODE_SHIORI_DISPLAY_NAME } from "../../../core/workers/shiori/reviewer.ts";
import type { Theme } from "../theme/theme.ts";

const RECODE_SHIORI_SKY_PALETTE = [
	{ hex: "#D9F2FF", ansi256: 195 },
	{ hex: "#A9DCF5", ansi256: 153 },
	{ hex: "#70C8F0", ansi256: 81 },
	{ hex: "#397FA8", ansi256: 31 },
] as const;
const RECODE_LIGHT_SHIORI_SKY_PALETTE = [
	{ hex: "#0B5F85", ansi256: 24 },
	{ hex: "#1477A4", ansi256: 31 },
	{ hex: "#278EBB", ansi256: 31 },
	{ hex: "#326E88", ansi256: 24 },
] as const;

const SHIORI_STAR_FRAMES = ["✦", "✧", "⋆", "✧"] as const;
const SHIORI_SHIMMER_INTERVAL_MS = 80;
const SHIORI_SHIMMER_RADIUS = 4;

function paletteForeground(text: string, paletteIndex: number, activeTheme: Theme): string {
	const palette = activeTheme.name === "light" ? RECODE_LIGHT_SHIORI_SKY_PALETTE : RECODE_SHIORI_SKY_PALETTE;
	const color = palette[Math.min(palette.length - 1, Math.max(0, paletteIndex))] ?? palette[2]!;
	const ansi =
		activeTheme.getColorMode() === "truecolor"
			? `\x1b[38;2;${Number.parseInt(color.hex.slice(1, 3), 16)};${Number.parseInt(color.hex.slice(3, 5), 16)};${Number.parseInt(color.hex.slice(5, 7), 16)}m`
			: `\x1b[38;5;${color.ansi256}m`;
	return `${ansi}${text}\x1b[39m`;
}

export function shioriForeground(text: string, activeTheme: Theme): string {
	return paletteForeground(text, 2, activeTheme);
}

/** Creates a star spinner with a moving sky-blue highlight across the complete Shiori line. */
export function createRecodeShioriIndicator(message: string, activeTheme: Theme): LoaderIndicatorOptions {
	const text = `${RECODE_SHIORI_DISPLAY_NAME}: ${message}`;
	const characters = Array.from(text);
	const italicSuffixStart = text.search(/\(\d+ entries\)$/);
	const frameCount = Math.max(12, Math.ceil((characters.length + SHIORI_SHIMMER_RADIUS * 2) / 2));
	const frames = Array.from({ length: frameCount }, (_, frameIndex) => {
		const shimmerCenter = frameIndex * 2 - SHIORI_SHIMMER_RADIUS;
		const star = SHIORI_STAR_FRAMES[frameIndex % SHIORI_STAR_FRAMES.length] ?? "✦";
		const renderedText = characters
			.map((character, characterIndex) => {
				const distance = Math.abs(characterIndex - shimmerCenter);
				const paletteIndex = distance === 0 ? 0 : distance <= 2 ? 1 : distance <= SHIORI_SHIMMER_RADIUS ? 2 : 3;
				let rendered = paletteForeground(character, paletteIndex, activeTheme);
				if (characterIndex === italicSuffixStart) rendered = `\x1b[3m${rendered}`;
				if (italicSuffixStart >= 0 && characterIndex === characters.length - 1) rendered = `${rendered}\x1b[23m`;
				return rendered;
			})
			.join("");
		return `${paletteForeground(star, frameIndex % 3, activeTheme)} ${renderedText}`;
	});
	return { frames, intervalMs: SHIORI_SHIMMER_INTERVAL_MS };
}
