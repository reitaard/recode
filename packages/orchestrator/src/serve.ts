import { serveMaestro } from "./service-runtime.ts";

/** Run Maestro as the sole foreground/manual service owner. */
export async function serve(): Promise<void> {
	await serveMaestro({ supervisionMode: "manual" });
}
