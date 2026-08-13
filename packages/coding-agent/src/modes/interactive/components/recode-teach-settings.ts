import { Container, type SettingItem, SettingsList } from "@reitaard/recode-tui";
import { getSettingsListTheme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";

export type RecodeTeachSettingId = "enabled" | "review" | "save" | "status";

export interface RecodeTeachSettingsState {
	ownerName: string;
	enabled: boolean;
	pending: number;
}

export class RecodeTeachSettingsComponent extends Container {
	private readonly settingsList: SettingsList;

	constructor(
		state: RecodeTeachSettingsState,
		onChange: (id: RecodeTeachSettingId, value: string) => void,
		onCancel: () => void,
	) {
		super();
		const items: SettingItem[] = [
			{
				id: "enabled",
				label: `${state.ownerName} Teach Mode`,
				description: "Notice durable lessons and stage them for review without activating them",
				currentValue: state.enabled ? "enabled" : "disabled",
				values: ["enabled", "disabled"],
			},
			{
				id: "review",
				label: "Review proposals",
				description: "Inspect pending memory proposals and their provenance",
				currentValue: `${state.pending} pending`,
				values: [`${state.pending} pending`],
			},
			{
				id: "save",
				label: "Approve proposal",
				description: "Choose one pending proposal and send it through Cardinal",
				currentValue: state.pending > 0 ? "choose" : "none",
				values: [state.pending > 0 ? "choose" : "none"],
			},
			{
				id: "status",
				label: "Show status",
				description: "Show the active owner, mode state, and pending proposal count",
				currentValue: "open",
				values: ["open"],
			},
		];

		this.addChild(new DynamicBorder());
		this.settingsList = new SettingsList(
			items,
			6,
			getSettingsListTheme(),
			(id, value) => onChange(id as RecodeTeachSettingId, value),
			onCancel,
			{ enableSearch: true },
		);
		this.addChild(this.settingsList);
		this.addChild(new DynamicBorder());
	}

	updateValue(id: RecodeTeachSettingId, value: string): void {
		this.settingsList.updateValue(id, value);
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}
