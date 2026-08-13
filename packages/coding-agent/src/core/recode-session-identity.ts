export interface RecodeSessionIdentityInput {
	id: string;
	timestamp?: string;
	cwd?: string;
	name?: string;
}

function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[^\x00-\x7F]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/g, "");
}

function projectName(cwd?: string): string {
	if (!cwd) return "session";
	const parts = cwd.split(/[\\/]+/).filter(Boolean);
	return parts.at(-1) ?? "root";
}

/** Human-readable session reference. The full UUID remains the storage identity. */
export function getRecodeSessionReference(input: RecodeSessionIdentityInput): string {
	const date = /^\d{4}-\d{2}-\d{2}/.exec(input.timestamp ?? "")?.[0] ?? "undated";
	const label = slugify(input.name?.trim() || projectName(input.cwd)) || "session";
	const shortId =
		input.id
			.replace(/[^a-zA-Z0-9]/g, "")
			.slice(0, 8)
			.toLowerCase() || "unknown";
	return `${date}-${label}-${shortId}`;
}
