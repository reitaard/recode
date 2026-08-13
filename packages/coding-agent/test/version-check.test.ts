import { afterEach, describe, expect, it, vi } from "vitest";
import {
	checkForNewPiVersion,
	comparePackageVersions,
	getLatestPiRelease,
	getLatestPiVersion,
	isNewerPackageVersion,
} from "../src/utils/version-check.ts";

const originalSkipVersionCheck = process.env.PI_SKIP_VERSION_CHECK;
const originalOffline = process.env.PI_OFFLINE;
const testUpdateEndpoint = "https://updates.recode.invalid/latest";

afterEach(() => {
	vi.unstubAllGlobals();
	if (originalSkipVersionCheck === undefined) {
		delete process.env.PI_SKIP_VERSION_CHECK;
	} else {
		process.env.PI_SKIP_VERSION_CHECK = originalSkipVersionCheck;
	}
	if (originalOffline === undefined) {
		delete process.env.PI_OFFLINE;
	} else {
		process.env.PI_OFFLINE = originalOffline;
	}
});

describe("version checks", () => {
	it("compares package versions", () => {
		expect(comparePackageVersions("0.70.6", "0.70.5")).toBeGreaterThan(0);
		expect(comparePackageVersions("0.70.5", "0.70.5")).toBe(0);
		expect(comparePackageVersions("0.70.4", "0.70.5")).toBeLessThan(0);
		expect(comparePackageVersions("5.0.0-beta.20", "5.0.0-beta.9")).toBeGreaterThan(0);
		expect(isNewerPackageVersion("0.70.5", "0.70.5")).toBe(false);
		expect(isNewerPackageVersion("0.70.6", "0.70.5")).toBe(true);
	});

	it("returns only newer versions", async () => {
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.3" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewPiVersion("1.2.3", undefined, { endpoint: testUpdateEndpoint })).resolves.toBeUndefined();
		await expect(checkForNewPiVersion("1.2.2", undefined, { endpoint: testUpdateEndpoint })).resolves.toEqual({
			version: "1.2.3",
		});
	});

	it("suppresses newer releases for a foreign package identity", async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({ packageName: "@reitaard/recode-coding-agent", version: "0.82.1" }),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			checkForNewPiVersion("0.81.4", "@mariozechner/pi-coding-agent", { endpoint: testUpdateEndpoint }),
		).resolves.toBeUndefined();
		await expect(
			checkForNewPiVersion("0.81.4", "@reitaard/recode-coding-agent", { endpoint: testUpdateEndpoint }),
		).resolves.toEqual({
			packageName: "@reitaard/recode-coding-agent",
			version: "0.82.1",
		});
	});

	it("uses an explicitly supplied Recode update endpoint", async () => {
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiVersion("1.2.3", { endpoint: testUpdateEndpoint })).resolves.toBe("1.2.4");
		expect(fetchMock).toHaveBeenCalledWith(
			testUpdateEndpoint,
			expect.objectContaining({
				headers: expect.objectContaining({
					"User-Agent": expect.stringMatching(/^pi\/1\.2\.3 /),
					accept: "application/json",
				}),
			}),
		);
	});

	it("returns the active package metadata from the version check api", async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				packageName: "@new-scope/pi",
				version: "1.2.4",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiRelease("1.2.3", { endpoint: testUpdateEndpoint })).resolves.toEqual({
			packageName: "@new-scope/pi",
			version: "1.2.4",
		});
	});

	it("returns update notes from the version check api", async () => {
		const fetchMock = vi.fn(async () => Response.json({ note: " **Read this** ", version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiRelease("1.2.3", { endpoint: testUpdateEndpoint })).resolves.toEqual({
			note: "**Read this**",
			version: "1.2.4",
		});
	});

	it("skips api calls when no validated Recode endpoint is built in", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestPiVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects non-HTTPS update endpoints", async () => {
		await expect(getLatestPiVersion("1.2.3", { endpoint: "http://updates.recode.invalid/latest" })).rejects.toThrow(
			"Recode update endpoint must use HTTPS",
		);
	});
});
