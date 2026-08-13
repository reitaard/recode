/** LSP path and language helpers adapted from can1357/oh-my-pi (MIT). */

import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LANGUAGE_IDS: Record<string, string> = {
	".c": "c",
	".cc": "cpp",
	".cpp": "cpp",
	".cs": "csharp",
	".css": "css",
	".go": "go",
	".html": "html",
	".java": "java",
	".js": "javascript",
	".jsx": "javascriptreact",
	".json": "json",
	".lua": "lua",
	".md": "markdown",
	".php": "php",
	".py": "python",
	".rb": "ruby",
	".rs": "rust",
	".scss": "scss",
	".sh": "shellscript",
	".swift": "swift",
	".toml": "toml",
	".ts": "typescript",
	".tsx": "typescriptreact",
	".vue": "vue",
	".xml": "xml",
	".yaml": "yaml",
	".yml": "yaml",
};

export function fileToUri(filePath: string): string {
	return pathToFileURL(path.resolve(filePath)).href;
}

export function uriToFile(uri: string): string {
	return fileURLToPath(uri);
}

export function detectLanguageId(filePath: string): string {
	return LANGUAGE_IDS[path.extname(filePath).toLowerCase()] ?? "plaintext";
}

export function commandBasename(command: string): string {
	return path.basename(command.replace(/\\/g, "/")).replace(/\.(?:exe|cmd|bat)$/i, "");
}
