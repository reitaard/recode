import type { NamedWorkerDefinition } from "./named-worker.ts";
import { type OrchestrationActorIdentity, RECODE_CREATOR_IDENTITY } from "./orchestration-identity.ts";
import type { WorkerConversationTurnResult, WorkerDirectory } from "./worker-directory.ts";

/** Host-owned direct-chat state. Conversation ids never need to enter user input. */
export class WorkerChatController {
	private readonly conversations = new Map<string, string>();
	private readonly activeControllers = new Map<string, AbortController>();
	private readonly directory: WorkerDirectory;
	private readonly speaker: OrchestrationActorIdentity;
	private readonly getContext?: (worker: NamedWorkerDefinition) => Promise<string | undefined>;

	constructor(
		directory: WorkerDirectory,
		speaker: OrchestrationActorIdentity = RECODE_CREATOR_IDENTITY,
		getContext?: (worker: NamedWorkerDefinition) => Promise<string | undefined>,
	) {
		this.directory = directory;
		this.speaker = speaker;
		this.getContext = getContext;
	}

	async send(workerReference: string, message: string, signal?: AbortSignal): Promise<WorkerConversationTurnResult> {
		const worker = this.directory.resolveWorker(workerReference);
		const controller = new AbortController();
		const onAbort = () => controller.abort();
		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) controller.abort();
		this.activeControllers.set(worker.id, controller);
		try {
			const conversationId = this.conversations.get(worker.id);
			const context = await this.getContext?.(worker);
			const turn = conversationId
				? await this.directory.messageConversation(conversationId, message, context, controller.signal)
				: await this.directory.startConversation(worker.id, message, context, controller.signal, this.speaker);
			this.conversations.set(worker.id, turn.conversation.conversationId);
			return turn;
		} finally {
			if (this.activeControllers.get(worker.id) === controller) this.activeControllers.delete(worker.id);
			signal?.removeEventListener("abort", onAbort);
		}
	}

	getConversationId(workerReference: string): string | undefined {
		return this.conversations.get(this.directory.resolveWorker(workerReference).id);
	}

	restore(workerReference: string, conversationId: string): void {
		const worker = this.directory.resolveWorker(workerReference);
		const snapshot = this.directory.getStatus(conversationId)[0];
		if (!snapshot || snapshot.workerId !== worker.id) {
			throw new Error(`Cannot restore direct chat for ${worker.displayName}: ${conversationId}`);
		}
		this.conversations.set(worker.id, conversationId);
	}

	cancel(workerReference: string): boolean {
		const worker = this.directory.resolveWorker(workerReference);
		const activeController = this.activeControllers.get(worker.id);
		if (activeController) {
			activeController.abort();
			return true;
		}
		const conversationId = this.conversations.get(worker.id);
		if (!conversationId) return false;
		return this.directory.cancelConversation(conversationId);
	}

	close(workerReference: string): boolean {
		const worker = this.directory.resolveWorker(workerReference);
		const activeController = this.activeControllers.get(worker.id);
		activeController?.abort();
		const conversationId = this.conversations.get(worker.id);
		if (!conversationId) return activeController !== undefined;
		this.directory.closeConversation(conversationId);
		this.conversations.delete(worker.id);
		return true;
	}

	clear(): void {
		for (const controller of this.activeControllers.values()) controller.abort();
		this.activeControllers.clear();
		for (const conversationId of this.conversations.values()) {
			try {
				this.directory.closeConversation(conversationId);
			} catch {
				// Session shutdown may race a directory-level close.
			}
		}
		this.conversations.clear();
	}
}
