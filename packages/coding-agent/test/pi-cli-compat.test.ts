import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCliArgs } from "../src/cli-runner.ts";

describe("Pi CLI compatibility", () => {
	it("publishes distinct recode and pi entrypoints", () => {
		const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8")) as {
			bin?: Record<string, string>;
		};
		expect(manifest.bin).toEqual({ recode: "dist/cli.js", pi: "dist/pi.js" });
		expect(manifest.bin?.pi).not.toBe(manifest.bin?.recode);
	});

	it("routes bare pi update to installed packages", () => {
		expect(normalizeCliArgs("pi", ["update"])).toEqual(["update", "--extensions"]);
	});

	it("preserves bare recode update for application self-update", () => {
		expect(normalizeCliArgs("recode", ["update"])).toEqual(["update"]);
	});

	it.each([
		["install", "npm:pi-better-harness"],
		["remove", "npm:pi-better-harness"],
		["list"],
		["update", "npm:pi-better-harness"],
		["update", "--self"],
		["update", "--all"],
	])("preserves explicit Pi arguments: %s", (...args) => {
		expect(normalizeCliArgs("pi", args)).toEqual(args);
	});
});
