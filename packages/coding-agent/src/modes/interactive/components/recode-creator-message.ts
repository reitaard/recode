import { Container, Markdown, type MarkdownTheme } from "@reitaard/recode-tui";
import { getMarkdownTheme, theme } from "../theme/theme.ts";
import { creatorForeground } from "./recode-worker-indicator.ts";

export class RecodeCreatorMessageComponent extends Container {
	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.addChild(
			new Markdown(`Creator: ${text}`, 1, 0, markdownTheme, {
				color: (content) => creatorForeground(theme.italic(content), theme),
			}),
		);
	}
}
