export const RECODE_CREATOR_ID = "creator";
export const RECODE_CREATOR_DISPLAY_NAME = "Creator";

const CREATOR_MESSAGE_PATTERN = /^<recode-creator-message actor="creator">([\s\S]*)<\/recode-creator-message>$/;

export function wrapRecodeCreatorMessage(text: string): string {
	const trimmed = text.trim();
	if (!trimmed || CREATOR_MESSAGE_PATTERN.test(trimmed)) return trimmed;
	return `<recode-creator-message actor="${RECODE_CREATOR_ID}">${trimmed}</recode-creator-message>`;
}

export function parseRecodeCreatorMessage(text: string): string | undefined {
	return text.trim().match(CREATOR_MESSAGE_PATTERN)?.[1]?.trim();
}
