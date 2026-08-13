import { describe, expect, it, vi } from "vitest";
import { createBashTool, getCatastrophicCommandReason } from "../src/core/tools/index.ts";

const home = process.platform === "win32" ? "C:\\Users\\creator" : "/home/creator";

describe("catastrophic command safety", () => {
	it.each([
		"rm -rf /",
		"rm --recursive /",
		"sudo rm -fr $HOME",
		"rm -rf ~",
		"rm -rf $HOME/..",
		"rm -rf $HOME/.ssh/..",
		"echo start && rm -r -f ~/.ssh",
		"find / -delete",
		"chmod -R 000 /",
		"dd if=/dev/zero of=/dev/sda",
		"mkfs.ext4 /dev/sda1",
		":(){ :|:& };:",
	])("denies catastrophic command %s", (command) => {
		expect(getCatastrophicCommandReason(command, { homeDir: home })).toBeTruthy();
	});

	it.each(["rm -rf ./dist", "git clean -fd", "find ./tmp -delete", "echo safe", "npm test"])(
		"does not classify project-scoped command %s as catastrophic",
		(command) => {
			expect(getCatastrophicCommandReason(command, { homeDir: home })).toBeUndefined();
		},
	);

	it("blocks before invoking the configured bash backend", async () => {
		const exec = vi.fn(async () => ({ exitCode: 0 }));
		const tool = createBashTool(process.cwd(), { operations: { exec } });
		await expect(tool.execute("danger", { command: "rm -rf /" })).rejects.toThrow(/Blocked a recursive/);
		expect(exec).not.toHaveBeenCalled();
	});
});
