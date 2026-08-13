export type OrchestrationActorKind = "human" | "agent";
export type OrchestrationActorRole = "creator" | "primary-agent";

/** Stable identity carried across orchestration boundaries and worker transcripts. */
export interface OrchestrationActorIdentity {
	readonly id: "creator" | "aizen";
	readonly displayName: string;
	readonly aliases?: readonly string[];
	readonly kind: OrchestrationActorKind;
	readonly role: OrchestrationActorRole;
}

export const RECODE_CREATOR_IDENTITY: OrchestrationActorIdentity = Object.freeze({
	id: "creator",
	displayName: "Creator",
	kind: "human",
	role: "creator",
});

export const RECODE_AIZEN_IDENTITY: OrchestrationActorIdentity = Object.freeze({
	id: "aizen",
	displayName: "Aizen",
	aliases: Object.freeze(["藍染"]),
	kind: "agent",
	role: "primary-agent",
});

export function formatOrchestrationActor(identity: OrchestrationActorIdentity): string {
	return identity.aliases?.[0] ? `${identity.displayName} (${identity.aliases[0]})` : identity.displayName;
}

export function formatOrchestrationActorContext(identity: OrchestrationActorIdentity): string {
	return `SPEAKER IDENTITY\nid=${identity.id}; name=${formatOrchestrationActor(identity)}; kind=${identity.kind}; role=${identity.role}`;
}
