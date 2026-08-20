import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
import type { AgentMessage } from "@reitaard/recode-agent-core";
import type { ImageContent } from "@reitaard/recode-ai";
import { getAgentDir } from "./config.ts";
import type { AgentSessionEvent } from "./core/agent-session.ts";
import {
	RecodeGateway,
	type RecodeGatewayDelivery,
	type RecodeGatewayInboundMessage,
	type RecodeGatewayRuntime,
} from "./core/recode-gateway.ts";
import { RecodeGatewayStore } from "./core/recode-gateway-store.ts";
import { RpcClient, type RpcClientOptions } from "./modes/rpc/rpc-client.ts";

const PREVIEW_LIMIT = 3900;
const EDIT_INTERVAL_MS = 750;
const TELEGRAM_DOWNLOAD_LIMIT = 20 * 1024 * 1024;
const TELEGRAM_UPLOAD_LIMIT = 50 * 1024 * 1024;

interface TelegramConfig {
	botToken: string;
	allowedUserId: number;
	allowedGroupIds: number[];
	workingDirectory?: string;
}

interface TelegramState {
	updateOffset: number;
	sessions: Record<string, string>;
}

interface TelegramUser {
	id: number;
	username?: string;
}

interface TelegramPhoto {
	file_id: string;
	file_size?: number;
}

interface TelegramDocument {
	file_id: string;
	file_name?: string;
	mime_type?: string;
	file_size?: number;
}

interface TelegramFile {
	file_id: string;
	file_path?: string;
	file_size?: number;
}

interface TelegramMessage {
	message_id: number;
	chat: { id: number; type: "private" | "group" | "supergroup" | "channel" };
	from?: TelegramUser;
	text?: string;
	caption?: string;
	photo?: TelegramPhoto[];
	document?: TelegramDocument;
	message_thread_id?: number;
	reply_to_message?: TelegramMessage;
}

interface TelegramUpdate {
	update_id: number;
	message?: TelegramMessage;
}

interface TelegramResponse<T> {
	ok: boolean;
	result?: T;
	description?: string;
}

function loadTelegramConfig(): TelegramConfig {
	const configPath = resolve(getAgentDir(), "telegram.json");
	const fileConfig = existsSync(configPath)
		? (JSON.parse(readFileSync(configPath, "utf8")) as Partial<TelegramConfig>)
		: {};
	const botToken = process.env.TELEGRAM_BOT_TOKEN ?? fileConfig.botToken;
	const allowedUserIdText = process.env.TELEGRAM_ALLOWED_USER_ID;
	const allowedUserId = allowedUserIdText ? Number(allowedUserIdText) : fileConfig.allowedUserId;
	const allowedGroupIdsText = process.env.TELEGRAM_ALLOWED_GROUP_IDS;
	const allowedGroupIds = allowedGroupIdsText
		? allowedGroupIdsText.split(",").map((value) => Number(value.trim()))
		: (fileConfig.allowedGroupIds ?? []);
	if (!botToken) throw new Error(`Telegram token missing. Set TELEGRAM_BOT_TOKEN or ${configPath}`);
	if (typeof allowedUserId !== "number" || !Number.isSafeInteger(allowedUserId)) {
		throw new Error(`Telegram user id missing. Set TELEGRAM_ALLOWED_USER_ID or ${configPath}`);
	}
	if (!Array.isArray(allowedGroupIds) || !allowedGroupIds.every(Number.isSafeInteger)) {
		throw new Error(`Telegram group ids must be integers. Set TELEGRAM_ALLOWED_GROUP_IDS or ${configPath}`);
	}
	return {
		botToken,
		allowedUserId,
		allowedGroupIds,
		workingDirectory: process.env.RECODE_TELEGRAM_CWD ?? fileConfig.workingDirectory ?? homedir(),
	};
}

function loadTelegramState(path: string): TelegramState {
	if (!existsSync(path)) return { updateOffset: 0, sessions: {} };
	const state = JSON.parse(readFileSync(path, "utf8")) as Partial<TelegramState>;
	return {
		updateOffset: typeof state.updateOffset === "number" ? state.updateOffset : 0,
		sessions: state.sessions ?? {},
	};
}

function extractAssistantText(message: AgentMessage): string | undefined {
	if (message.role !== "assistant") return undefined;
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
}

export function rpcProcessOptions(cwd: string, sessionId: string, sessionDir?: string): RpcClientOptions {
	const isNode = basename(process.execPath).toLowerCase().startsWith("node");
	return {
		cwd,
		runtimeExecutable: process.execPath,
		runtimeArgs: isNode ? [process.argv[1]] : [],
		args: ["--mode", "rpc", "--session-id", sessionId, ...(sessionDir ? ["--session-dir", sessionDir] : [])],
	};
}

function escapeTelegramHtml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeTelegramHtmlAttribute(text: string): string {
	// Inline links are matched after text escaping; only quote characters remain unsafe in an attribute.
	return text.replaceAll('"', "&quot;");
}

function renderTelegramInlineMarkdown(text: string): string {
	const tokens: string[] = [];
	const replaceToken = (html: string): string => {
		const index = tokens.push(html) - 1;
		return `\u0000${index}\u0000`;
	};
	let rendered = text.replace(/`([^`\n]*)`/g, (_match, code: string) =>
		replaceToken(`<code>${escapeTelegramHtml(code)}</code>`),
	);
	rendered = escapeTelegramHtml(rendered)
		.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, url: string) =>
			replaceToken(`<a href="${escapeTelegramHtmlAttribute(url)}">${renderTelegramInlineMarkdown(label)}</a>`),
		)
		.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
		.replace(/__([^_\n]+)__/g, "<b>$1</b>")
		.replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
		.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>")
		.replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, "$1<i>$2</i>");
	return rendered.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => tokens[Number(index)] ?? "");
}

/** Convert common model Markdown to Telegram's supported HTML subset. */
export function renderTelegramHtml(markdown: string): string {
	const lines = markdown.replaceAll("\r\n", "\n").split("\n");
	const rendered: string[] = [];
	let codeFence: { language: string; lines: string[] } | undefined;
	const flushCodeFence = () => {
		if (!codeFence) return;
		const languageClass = codeFence.language ? ` class="language-${codeFence.language}"` : "";
		rendered.push(`<pre><code${languageClass}>${escapeTelegramHtml(codeFence.lines.join("\n"))}</code></pre>`);
		codeFence = undefined;
	};

	for (const line of lines) {
		const fence = /^```([a-zA-Z0-9_+-]*)\s*$/.exec(line);
		if (fence) {
			if (codeFence) flushCodeFence();
			else codeFence = { language: fence[1], lines: [] };
			continue;
		}
		if (codeFence) {
			codeFence.lines.push(line);
			continue;
		}
		const heading = /^(?:#{1,6})\s+(.+)$/.exec(line);
		const quote = /^>\s?(.*)$/.exec(line);
		const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
		const ordered = /^\s*(\d+)\.\s+(.+)$/.exec(line);
		if (heading) rendered.push(`<b>${renderTelegramInlineMarkdown(heading[1])}</b>`);
		else if (quote) rendered.push(`<blockquote>${renderTelegramInlineMarkdown(quote[1])}</blockquote>`);
		else if (unordered) rendered.push(`• ${renderTelegramInlineMarkdown(unordered[1])}`);
		else if (ordered) rendered.push(`${ordered[1]}. ${renderTelegramInlineMarkdown(ordered[2])}`);
		else rendered.push(renderTelegramInlineMarkdown(line));
	}
	flushCodeFence();
	return rendered.join("\n");
}

function isTelegramParseError(error: unknown): boolean {
	return error instanceof Error && /parse entities|can.t parse/i.test(error.message);
}

class TelegramApi {
	private readonly baseUrl: string;

	constructor(token: string) {
		this.baseUrl = `https://api.telegram.org/bot${token}`;
	}

	async call<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
		const response = await fetch(`${this.baseUrl}/${method}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			signal,
		});
		const result = (await response.json()) as TelegramResponse<T>;
		if (!response.ok || !result.ok || result.result === undefined) {
			throw new Error(result.description ?? `Telegram ${method} failed with HTTP ${response.status}`);
		}
		return result.result;
	}

	getUpdates(offset: number, signal: AbortSignal): Promise<TelegramUpdate[]> {
		return this.call("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] }, signal);
	}

	getMe(): Promise<TelegramUser> {
		return this.call("getMe", {});
	}

	getFile(fileId: string): Promise<TelegramFile> {
		return this.call("getFile", { file_id: fileId });
	}

	async downloadFile(fileId: string): Promise<Buffer> {
		const file = await this.getFile(fileId);
		if (!file.file_path || !/^[a-zA-Z0-9_./-]+$/.test(file.file_path))
			throw new Error("Telegram returned an invalid file path");
		if (file.file_size !== undefined && file.file_size > TELEGRAM_DOWNLOAD_LIMIT) {
			throw new Error("Telegram attachment exceeds the 20 MB cloud download limit");
		}
		const response = await fetch(`${this.baseUrl.replace("/bot", "/file/bot")}/${file.file_path}`);
		if (!response.ok) throw new Error(`Telegram file download failed with HTTP ${response.status}`);
		const length = Number(response.headers.get("content-length"));
		if (Number.isFinite(length) && length > TELEGRAM_DOWNLOAD_LIMIT) {
			throw new Error("Telegram attachment exceeds the 20 MB cloud download limit");
		}
		const bytes = Buffer.from(await response.arrayBuffer());
		if (bytes.byteLength > TELEGRAM_DOWNLOAD_LIMIT)
			throw new Error("Telegram attachment exceeds the 20 MB cloud download limit");
		return bytes;
	}

	deleteWebhook(): Promise<boolean> {
		return this.call("deleteWebhook", { drop_pending_updates: false });
	}

	async sendMessage(
		chatId: number,
		text: string,
		replyToMessageId?: number,
		threadId?: number,
	): Promise<TelegramMessage> {
		const body = {
			chat_id: chatId,
			text: renderTelegramHtml(text),
			parse_mode: "HTML",
			...(threadId ? { message_thread_id: threadId } : {}),
			...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {}),
		};
		try {
			return await this.call("sendMessage", body);
		} catch (error: unknown) {
			if (!isTelegramParseError(error)) throw error;
			return this.call("sendMessage", { ...body, text, parse_mode: undefined });
		}
	}

	deleteMessage(chatId: number, messageId: number): Promise<boolean> {
		return this.call("deleteMessage", { chat_id: chatId, message_id: messageId });
	}

	async sendDocument(chatId: number, path: string, threadId?: number): Promise<TelegramMessage> {
		const document = new Blob([readFileSync(path)]);
		const body = new FormData();
		body.set("chat_id", String(chatId));
		body.set("document", document, basename(path));
		if (threadId) body.set("message_thread_id", String(threadId));
		const response = await fetch(`${this.baseUrl}/sendDocument`, { method: "POST", body });
		const result = (await response.json()) as TelegramResponse<TelegramMessage>;
		if (!response.ok || !result.ok || result.result === undefined) {
			throw new Error(result.description ?? `Telegram sendDocument failed with HTTP ${response.status}`);
		}
		return result.result;
	}

	async editMessage(chatId: number, messageId: number, text: string): Promise<TelegramMessage> {
		const body = { chat_id: chatId, message_id: messageId, text: renderTelegramHtml(text), parse_mode: "HTML" };
		try {
			return await this.call("editMessageText", body);
		} catch (error: unknown) {
			if (!isTelegramParseError(error)) throw error;
			return this.call("editMessageText", { ...body, text, parse_mode: undefined });
		}
	}
}

export class TelegramRpcRuntime implements RecodeGatewayRuntime {
	private readonly rpc: RpcClient;
	private onText: ((text: string) => void) | undefined;
	private onActivity: ((text: string) => void) | undefined;

	constructor(rpc: RpcClient) {
		this.rpc = rpc;
		this.rpc.onEvent((event) => this.handleAgentEvent(event));
	}

	async start(): Promise<void> {
		try {
			await this.rpc.start();
			await this.rpc.waitUntilReady(5 * 60 * 1000);
		} catch (error) {
			await this.rpc.stop().catch(() => undefined);
			throw error;
		}
	}

	async run(
		prompt: string,
		onText: (text: string) => void,
		images?: ImageContent[],
		onActivity?: (text: string) => void,
	): Promise<void> {
		this.onText = onText;
		this.onActivity = onActivity;
		try {
			await this.rpc.promptAndWait(prompt, images, 30 * 60 * 1000);
		} finally {
			this.onText = undefined;
			this.onActivity = undefined;
		}
	}

	abort(): Promise<void> {
		return this.rpc.abort();
	}

	close(): Promise<void> {
		return this.rpc.stop();
	}

	private handleAgentEvent(event: AgentSessionEvent): void {
		if (event.type === "tool_execution_start") {
			const activity =
				{
					read: "Reading relevant files…",
					write: "Writing files…",
					edit: "Updating files…",
					bash: "Running a command…",
					web_search: "Researching sources…",
					fetch_content: "Reading a source…",
				}[event.toolName] ?? "Using a tool…";
			this.onActivity?.(activity);
			return;
		}
		if (event.type !== "message_update" && event.type !== "message_end") return;
		const text = extractAssistantText(event.message);
		if (text) this.onText?.(text);
	}
}

class TelegramDelivery implements RecodeGatewayDelivery {
	private readonly api: TelegramApi;
	private readonly chatId: number;
	private readonly replyToMessageId: number;
	private readonly threadId: number | undefined;
	private readonly workspace: string;
	private previewMessageId: number | undefined;
	private responseMessageId: number | undefined;
	private responseMode = false;
	private previewText = "";
	private lastEditedText = "";
	private lastEditAt = 0;
	private editTimer: ReturnType<typeof setTimeout> | undefined;
	private flushChain: Promise<void> = Promise.resolve();

	constructor(api: TelegramApi, chatId: number, replyToMessageId: number, workspace: string, threadId?: number) {
		this.api = api;
		this.chatId = chatId;
		this.replyToMessageId = replyToMessageId;
		this.workspace = resolve(workspace);
		this.threadId = threadId === 1 ? undefined : threadId;
	}

	async begin(): Promise<void> {
		this.previewMessageId = (
			await this.api.sendMessage(this.chatId, "**Generating now…**", this.replyToMessageId, this.threadId)
		).message_id;
	}

	progress(text: string): Promise<void> {
		if (this.responseMode) return Promise.resolve();
		this.previewText = text;
		return this.queueFlush(false);
	}

	update(text: string): Promise<void> {
		this.responseMode = true;
		this.previewText = text;
		return this.queueFlush(false);
	}

	async complete(text: string): Promise<void> {
		const files = this.workspaceFiles(text);
		const responseText = text
			.replace(/^\s*[-*+]\s*\[[^\]]+\]\(sandbox:[^)]+\)\s*$/gm, "")
			.replace(/\[[^\]]+\]\(sandbox:[^)]+\)/g, "")
			.trim();
		if (!responseText) {
			if (this.responseMessageId)
				await this.api.deleteMessage(this.chatId, this.responseMessageId).catch(() => undefined);
			else if (this.previewMessageId)
				await this.api.deleteMessage(this.chatId, this.previewMessageId).catch(() => undefined);
			for (const path of files) await this.api.sendDocument(this.chatId, path, this.threadId);
			return;
		}
		this.responseMode = true;
		this.previewText = responseText;
		await this.queueFlush(true);
		for (const path of files) await this.api.sendDocument(this.chatId, path, this.threadId);
	}

	async fail(message: string): Promise<void> {
		if (this.editTimer) clearTimeout(this.editTimer);
		await this.api.sendMessage(this.chatId, `Recode failed: ${message}`, this.replyToMessageId, this.threadId);
	}

	private workspaceFiles(text: string): string[] {
		const root = realpathSync(this.workspace);
		const files = new Set<string>();
		for (const match of text.matchAll(/\[[^\]]+\]\(sandbox:([^)]+)\)/g)) {
			let path: string;
			try {
				path = decodeURIComponent(match[1]);
			} catch {
				continue;
			}
			const candidate = resolve(path);
			if (relative(root, candidate).startsWith("..") || !existsSync(candidate)) continue;
			if (lstatSync(candidate).isSymbolicLink() || !statSync(candidate).isFile()) continue;
			const realFile = realpathSync(candidate);
			if (relative(root, realFile).startsWith("..") || statSync(realFile).size > TELEGRAM_UPLOAD_LIMIT) continue;
			files.add(realFile);
		}
		return [...files];
	}

	private queueFlush(force: boolean): Promise<void> {
		this.flushChain = this.flushChain
			.then(() => this.flush(force))
			.catch((error: unknown) => console.error(error instanceof Error ? error.message : String(error)));
		return this.flushChain;
	}

	private async flush(force: boolean): Promise<void> {
		if (!this.previewMessageId || !this.previewText) return;
		if (this.responseMode && !this.responseMessageId) {
			this.responseMessageId = (
				await this.api.sendMessage(this.chatId, "**Responding now…**", undefined, this.threadId)
			).message_id;
			await this.api.deleteMessage(this.chatId, this.previewMessageId).catch(() => undefined);
			this.lastEditedText = "";
		}
		const targetMessageId = this.responseMessageId ?? this.previewMessageId;
		const elapsed = Date.now() - this.lastEditAt;
		if (!force && elapsed < EDIT_INTERVAL_MS) {
			if (!this.editTimer) {
				this.editTimer = setTimeout(() => {
					this.editTimer = undefined;
					void this.queueFlush(false);
				}, EDIT_INTERVAL_MS - elapsed);
			}
			return;
		}
		if (this.editTimer) clearTimeout(this.editTimer);
		this.editTimer = undefined;
		const chunks = chunkText(this.previewText);
		if (chunks[0] !== this.lastEditedText) {
			await this.api.editMessage(this.chatId, targetMessageId, chunks[0]);
			this.lastEditedText = chunks[0];
		}
		if (force) {
			for (const chunk of chunks.slice(1)) await this.api.sendMessage(this.chatId, chunk, undefined, this.threadId);
		}
		this.lastEditAt = Date.now();
	}
}

export function telegramConversationId(chatId: number, threadId?: number): string {
	return threadId ? `${chatId}:topic:${threadId}` : String(chatId);
}

export function parseTelegramConversationId(conversationId: string): { chatId: number; threadId?: number } {
	const match = /^(-?\d+)(?::topic:(\d+))?$/.exec(conversationId);
	if (!match) throw new Error(`Invalid Telegram conversation id: ${conversationId}`);
	return { chatId: Number(match[1]), threadId: match[2] ? Number(match[2]) : undefined };
}

export function normalizeTelegramText(text: string, botUsername?: string): string {
	if (!botUsername) return text.trim();
	return text
		.replace(new RegExp(`@${botUsername}\\b`, "gi"), "")
		.replace(/^\/(\w+)@\w+/, "/$1")
		.trim();
}

export function telegramTopicSessionsDirectory(workingDirectory: string, chatId: number, threadId: number): string {
	return join(resolve(workingDirectory), "Topics", "sessions", `${chatId}-${threadId}`);
}

export function telegramTopicWorkspaceDirectory(workingDirectory: string, chatId: number, threadId: number): string {
	return join(resolve(workingDirectory), "Topics", "workspaces", `${chatId}-${threadId}`);
}

function telegramRoute(message: RecodeGatewayInboundMessage): string {
	return `${message.channel}:${message.conversationId}`;
}

function imageMimeType(bytes: Buffer): string | undefined {
	if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
	if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from("\x89PNG\r\n\x1a\n", "binary"))) return "image/png";
	if (
		bytes.length >= 12 &&
		bytes.subarray(0, 4).equals(Buffer.from("RIFF")) &&
		bytes.subarray(8, 12).equals(Buffer.from("WEBP"))
	)
		return "image/webp";
	return undefined;
}

function attachmentStorageName(messageId: number, originalName?: string): string {
	const extension = originalName
		? extname(originalName)
				.toLowerCase()
				.replace(/[^.a-z0-9]/g, "")
		: "";
	return `telegram-${messageId}-${Date.now()}${extension.slice(0, 16) || ".bin"}`;
}

function isForumTopic(message: TelegramMessage): message is TelegramMessage & { message_thread_id: number } {
	return (
		(message.chat.type === "group" || message.chat.type === "supergroup") &&
		typeof message.message_thread_id === "number" &&
		Number.isSafeInteger(message.message_thread_id)
	);
}

class RecodeTelegramAdapter {
	private readonly api: TelegramApi;
	private readonly config: TelegramConfig;
	private readonly abortController = new AbortController();
	private readonly statePath = resolve(getAgentDir(), "telegram-state.json");
	private readonly state = loadTelegramState(this.statePath);
	private readonly store = new RecodeGatewayStore(resolve(getAgentDir(), "recode-gateway.sqlite"));
	private readonly gateway: RecodeGateway;
	private bot: TelegramUser | undefined;

	constructor(config: TelegramConfig) {
		this.config = config;
		this.api = new TelegramApi(config.botToken);
		this.store.open();
		this.gateway = new RecodeGateway({
			sessions: {
				getSessionId: (route) =>
					this.store.getSessionId(route) ??
					this.state.sessions[route] ??
					this.state.sessions[route.slice(route.indexOf(":") + 1)],
				setSessionId: (route, sessionId) => {
					this.store.setSessionId(route, sessionId);
					this.state.sessions[route] = sessionId;
					this.saveState();
				},
			},
			jobs: this.store,
			createSessionId: (message) => `telegram-${message.conversationId.replaceAll(":", "-")}-${message.messageId}`,
			createRuntime: async (route, sessionId) => {
				const workingDirectory = resolve(this.config.workingDirectory ?? process.cwd());
				const conversation = parseTelegramConversationId(route.slice("telegram:".length));
				const sessionDir = conversation.threadId
					? telegramTopicSessionsDirectory(workingDirectory, conversation.chatId, conversation.threadId)
					: undefined;
				const cwd = conversation.threadId
					? telegramTopicWorkspaceDirectory(workingDirectory, conversation.chatId, conversation.threadId)
					: workingDirectory;
				if (conversation.threadId) mkdirSync(cwd, { recursive: true, mode: 0o700 });
				const runtime = new TelegramRpcRuntime(new RpcClient(rpcProcessOptions(cwd, sessionId, sessionDir)));
				await runtime.start();
				return runtime;
			},
		});
	}

	async run(): Promise<void> {
		try {
			try {
				this.bot = await this.api.getMe();
				await this.api.deleteWebhook();
			} catch (error: unknown) {
				if (!this.bot) throw error;
				console.warn(
					`Telegram webhook cleanup failed; continuing with polling: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			console.log(`Recode Telegram gateway started${this.bot.username ? ` as @${this.bot.username}` : ""}`);
			const recovered = this.gateway.recover((message) => {
				const route = parseTelegramConversationId(message.conversationId);
				const workingDirectory = this.config.workingDirectory ?? process.cwd();
				const workspace = route.threadId
					? telegramTopicWorkspaceDirectory(workingDirectory, route.chatId, route.threadId)
					: workingDirectory;
				return new TelegramDelivery(this.api, route.chatId, Number(message.messageId), workspace, route.threadId);
			});
			if (recovered > 0) console.log(`Recovered ${recovered} accepted Telegram turn${recovered === 1 ? "" : "s"}`);
			let offset = this.state.updateOffset;
			while (!this.abortController.signal.aborted) {
				try {
					const updates = await this.api.getUpdates(offset, this.abortController.signal);
					for (const update of updates) {
						await this.handleUpdate(update);
						offset = Math.max(offset, update.update_id + 1);
						this.state.updateOffset = offset;
						this.saveState();
					}
				} catch (error: unknown) {
					if (this.abortController.signal.aborted) break;
					console.error(error instanceof Error ? error.message : String(error));
					await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
				}
			}
		} finally {
			await this.gateway.close();
			this.store.close();
		}
	}

	stop(): void {
		this.abortController.abort();
	}

	private async handleUpdate(update: TelegramUpdate): Promise<void> {
		const message = update.message;
		if (!message || message.from?.id !== this.config.allowedUserId) return;
		const rawText = message.text ?? message.caption ?? "";
		if (!rawText && !message.photo?.length && !message.document) return;
		const text = normalizeTelegramText(rawText, this.bot?.username);
		const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
		if (isGroup && !this.config.allowedGroupIds.includes(message.chat.id)) return;
		if (!isGroup && message.chat.type !== "private") return;
		let gatewayMessage: RecodeGatewayInboundMessage;
		try {
			gatewayMessage = await this.toGatewayMessage(message, text);
		} catch (error: unknown) {
			await this.api.sendMessage(
				message.chat.id,
				`Attachment rejected: ${error instanceof Error ? error.message : String(error)}`,
				message.message_id,
				message.message_thread_id,
			);
			return;
		}
		const route = telegramRoute(gatewayMessage);
		const forumTopic = isForumTopic(message);
		const connectedTopic = forumTopic && this.store.isTopicConnected(route);
		const mentioned = this.bot?.username
			? rawText.toLowerCase().includes(`@${this.bot.username.toLowerCase()}`)
			: false;
		const addressed = mentioned || message.reply_to_message?.from?.id === this.bot?.id;
		const gatewayCommand = /^\/(?:connect|disconnect|new|reload|start|status|stop)(?:\s|$)/.test(text);
		if (isGroup && !connectedTopic && !addressed && !gatewayCommand) return;

		if (text === "/connect" || text === "/connect new") {
			if (!forumTopic) {
				await this.api.sendMessage(
					message.chat.id,
					"Open a forum topic, then run /connect there.",
					message.message_id,
					message.message_thread_id,
				);
				return;
			}
			const existingSession = this.store.getSessionId(route) ?? this.state.sessions[route];
			if (text === "/connect new" || !existingSession) {
				if (!(await this.gateway.reset(gatewayMessage))) {
					await this.api.sendMessage(
						message.chat.id,
						"Aizen is busy. Stop the active turn before connecting a new topic session.",
						message.message_id,
						message.message_thread_id,
					);
					return;
				}
			}
			this.store.connectTopic(route);
			const workingDirectory = this.config.workingDirectory ?? process.cwd();
			const sessionDir = telegramTopicSessionsDirectory(
				workingDirectory,
				message.chat.id,
				message.message_thread_id,
			);
			const workspaceDir = telegramTopicWorkspaceDirectory(
				workingDirectory,
				message.chat.id,
				message.message_thread_id,
			);
			mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });
			await this.api.sendMessage(
				message.chat.id,
				`${existingSession && text === "/connect" ? "Reconnected" : "Connected"} topic ${message.message_thread_id}.\nWorkspace: \`${workspaceDir}\`\nSession directory: \`${sessionDir}\``,
				message.message_id,
				message.message_thread_id,
			);
			return;
		}

		if (text === "/disconnect") {
			if (!forumTopic || !connectedTopic) {
				await this.api.sendMessage(
					message.chat.id,
					"This topic is not connected. Use /connect inside a forum topic first.",
					message.message_id,
					message.message_thread_id,
				);
				return;
			}
			if (this.gateway.getStatus().running) {
				await this.api.sendMessage(
					message.chat.id,
					"Aizen is busy. Use /stop before disconnecting this topic.",
					message.message_id,
					message.message_thread_id,
				);
				return;
			}
			this.store.disconnectTopic(route);
			await this.api.sendMessage(
				message.chat.id,
				"Topic disconnected. Its session remains available if you run /connect again.",
				message.message_id,
				message.message_thread_id,
			);
			return;
		}

		if (isGroup && !connectedTopic) {
			if (gatewayCommand || addressed) {
				await this.api.sendMessage(
					message.chat.id,
					"This topic is not connected. Run /connect to create or resume its session.",
					message.message_id,
					message.message_thread_id,
				);
			}
			return;
		}
		if (text === "/start") {
			await this.api.sendMessage(
				message.chat.id,
				"Recode is connected. Send a task to Aizen.",
				message.message_id,
				message.message_thread_id,
			);
			return;
		}
		if (text === "/status") {
			const status = this.gateway.getStatus();
			const jobs = this.store.counts();
			const uptimeMinutes = Math.floor(status.uptimeMs / 60_000);
			await this.api.sendMessage(
				message.chat.id,
				`${status.running ? "Aizen is running" : "Aizen is ready"} · ${status.queued} queued · ${uptimeMinutes}m uptime · ${jobs.accepted} recoverable`,
				message.message_id,
				message.message_thread_id,
			);
			return;
		}
		if (text === "/stop") {
			await this.gateway.abort();
			await this.api.sendMessage(
				message.chat.id,
				"Aizen stopped. The queue was cleared.",
				message.message_id,
				message.message_thread_id,
			);
			return;
		}
		if (text === "/reload") {
			if (!(await this.gateway.reload(gatewayMessage))) {
				await this.api.sendMessage(
					message.chat.id,
					"Aizen is busy. Use /stop before reloading this runtime.",
					message.message_id,
					message.message_thread_id,
				);
				return;
			}
			await this.api.sendMessage(
				message.chat.id,
				"Runtime reloaded. Skills, MCP configuration, and project instructions will be loaded for the next turn.",
				message.message_id,
				message.message_thread_id,
			);
			return;
		}
		if (text === "/new") {
			if (!(await this.gateway.reset(gatewayMessage))) {
				await this.api.sendMessage(
					message.chat.id,
					"Aizen is busy. Stop the active turn before starting a new session.",
					message.message_id,
					message.message_thread_id,
				);
				return;
			}
			await this.api.sendMessage(
				message.chat.id,
				"New Recode session started.",
				message.message_id,
				message.message_thread_id,
			);
			return;
		}
		if (text.startsWith("/")) {
			await this.api.sendMessage(
				message.chat.id,
				"Unknown command. Use /connect, /disconnect, /new, /reload, /status, or /stop.",
				message.message_id,
				message.message_thread_id,
			);
			return;
		}

		const status = this.gateway.getStatus();
		const submission = this.gateway.submit(
			gatewayMessage,
			new TelegramDelivery(
				this.api,
				message.chat.id,
				message.message_id,
				isForumTopic(message)
					? telegramTopicWorkspaceDirectory(
							this.config.workingDirectory ?? process.cwd(),
							message.chat.id,
							message.message_thread_id,
						)
					: (this.config.workingDirectory ?? process.cwd()),
				message.message_thread_id,
			),
		);
		if (!submission.accepted) return;
		if (status.running) {
			await this.api.sendMessage(
				message.chat.id,
				`Queued · ${status.queued + 1} waiting`,
				message.message_id,
				message.message_thread_id,
			);
		}
	}

	private async toGatewayMessage(message: TelegramMessage, text: string): Promise<RecodeGatewayInboundMessage> {
		const conversationId = telegramConversationId(message.chat.id, message.message_thread_id);
		const route = `telegram:${conversationId}`;
		const groupMessage = message.chat.type === "group" || message.chat.type === "supergroup";
		if (groupMessage && (!isForumTopic(message) || !this.store.isTopicConnected(route))) {
			return { channel: "telegram", conversationId, messageId: String(message.message_id), text };
		}
		const workingDirectory = resolve(this.config.workingDirectory ?? process.cwd());
		const workspace = isForumTopic(message)
			? telegramTopicWorkspaceDirectory(workingDirectory, message.chat.id, message.message_thread_id)
			: workingDirectory;
		const document = message.document;
		const photo = message.photo?.at(-1);
		if (!document && !photo) {
			return { channel: "telegram", conversationId, messageId: String(message.message_id), text };
		}
		const attachment = document ?? photo;
		if (!attachment) throw new Error("Telegram attachment is missing file metadata");
		if (attachment.file_size !== undefined && attachment.file_size > TELEGRAM_DOWNLOAD_LIMIT) {
			throw new Error("Telegram attachment exceeds the 20 MB cloud download limit");
		}
		const bytes = await this.api.downloadFile(attachment.file_id);
		const uploadsDirectory = join(workspace, "uploads");
		mkdirSync(uploadsDirectory, { recursive: true, mode: 0o700 });
		if (photo) {
			const mimeType = imageMimeType(bytes);
			if (!mimeType) throw new Error("Telegram photo has an unsupported image format");
			const filename = attachmentStorageName(
				message.message_id,
				mimeType === "image/jpeg" ? "photo.jpg" : mimeType === "image/png" ? "photo.png" : "photo.webp",
			);
			writeFileSync(join(uploadsDirectory, filename), bytes, { flag: "wx", mode: 0o600 });
			return {
				channel: "telegram",
				conversationId,
				messageId: String(message.message_id),
				text: text || `The user attached an image at uploads/${filename}.`,
				images: [{ type: "image", data: bytes.toString("base64"), mimeType }],
			};
		}
		if (!document) throw new Error("Telegram attachment is missing document metadata");
		const filename = attachmentStorageName(message.message_id, document.file_name);
		writeFileSync(join(uploadsDirectory, filename), bytes, { flag: "wx", mode: 0o600 });
		const attachmentPrompt = `An untrusted user attachment was saved at uploads/${filename}. Inspect it only when relevant; do not execute or unpack it automatically.`;
		return {
			channel: "telegram",
			conversationId,
			messageId: String(message.message_id),
			text: text ? `${text}\n\n${attachmentPrompt}` : attachmentPrompt,
		};
	}

	private saveState(): void {
		mkdirSync(getAgentDir(), { recursive: true, mode: 0o700 });
		writeFileSync(this.statePath, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
	}
}

function chunkText(text: string): string[] {
	const chunks: string[] = [];
	let remaining = text.trim() || "Completed without a text response.";
	while (remaining.length > PREVIEW_LIMIT) {
		let boundary = remaining.lastIndexOf("\n", PREVIEW_LIMIT);
		if (boundary < PREVIEW_LIMIT / 2) boundary = remaining.lastIndexOf(" ", PREVIEW_LIMIT);
		if (boundary < PREVIEW_LIMIT / 2) boundary = PREVIEW_LIMIT;
		chunks.push(remaining.slice(0, boundary));
		remaining = remaining.slice(boundary).trimStart();
	}
	chunks.push(remaining);
	return chunks;
}

export async function runRecodeTelegramGateway(): Promise<void> {
	const adapter = new RecodeTelegramAdapter(loadTelegramConfig());
	const stop = () => adapter.stop();
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
	await adapter.run();
}
