import { randomBytes, timingSafeEqual } from "node:crypto";
import {
	chmodSync,
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { getIpcAuthPath } from "./config.ts";

interface IpcAuthRecord {
	schemaVersion: 1;
	token: string;
	createdAt: string;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function ensurePrivateDirectory(path: string): void {
	mkdirSync(path, { recursive: true, mode: 0o700 });
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error("Maestro IPC authentication directory is not a regular directory");
	}
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
		chmodSync(path, 0o700);
		if ((lstatSync(path).mode & 0o077) !== 0) {
			throw new Error("Maestro IPC authentication directory permissions must be 0700");
		}
	}
}

function parseAuthRecord(path: string): IpcAuthRecord {
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink())
		throw new Error("Maestro IPC authentication path is not a regular file");
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
		throw new Error("Maestro IPC authentication file permissions must be 0600");
	}
	const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<IpcAuthRecord>;
	if (
		parsed.schemaVersion !== 1 ||
		typeof parsed.token !== "string" ||
		!TOKEN_PATTERN.test(parsed.token) ||
		typeof parsed.createdAt !== "string" ||
		!Number.isFinite(Date.parse(parsed.createdAt))
	) {
		throw new Error("Maestro IPC authentication file is invalid");
	}
	return parsed as IpcAuthRecord;
}

export function ensureIpcAuthToken(): string {
	const path = getIpcAuthPath();
	ensurePrivateDirectory(dirname(path));
	if (existsSync(path)) return parseAuthRecord(path).token;
	const record: IpcAuthRecord = {
		schemaVersion: 1,
		token: randomBytes(32).toString("base64url"),
		createdAt: new Date().toISOString(),
	};
	const temporaryPath = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
	let descriptor: number | undefined;
	try {
		descriptor = openSync(temporaryPath, "wx", 0o600);
		writeSync(descriptor, `${JSON.stringify(record)}\n`, undefined, "utf8");
		fsyncSync(descriptor);
		closeSync(descriptor);
		descriptor = undefined;
		renameSync(temporaryPath, path);
		if (process.platform !== "win32") chmodSync(path, 0o600);
	} catch (error) {
		if (descriptor !== undefined) closeSync(descriptor);
		if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
		throw error;
	}
	return parseAuthRecord(path).token;
}

export function readIpcAuthToken(): string {
	const path = getIpcAuthPath();
	ensurePrivateDirectory(dirname(path));
	if (!existsSync(path)) throw new Error("Maestro IPC authentication is unavailable; start the service first");
	return parseAuthRecord(path).token;
}

export function authenticateIpcToken(expected: string, supplied: unknown): boolean {
	if (typeof supplied !== "string" || !TOKEN_PATTERN.test(expected) || !TOKEN_PATTERN.test(supplied)) return false;
	const expectedBytes = Buffer.from(expected);
	const suppliedBytes = Buffer.from(supplied);
	return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}
