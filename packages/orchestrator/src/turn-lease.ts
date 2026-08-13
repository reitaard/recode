import { randomBytes } from "node:crypto";

const DEFAULT_MAX_LEASES = 512;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;

export interface SessionTurnLeaseToken {
	sessionId: string;
	readonly ownerId: string;
	readonly generation: number;
	readonly capability: string;
	released: boolean;
}

interface LeaseWaiter {
	token: SessionTurnLeaseToken;
	settled: boolean;
	resolve(token: SessionTurnLeaseToken): void;
	reject(error: Error): void;
	timer: NodeJS.Timeout;
}

interface SessionLease {
	holder?: SessionTurnLeaseToken;
	waiters: LeaseWaiter[];
	lastUsed: number;
}

export interface SessionTurnLeaseRegistryOptions {
	maxEntries?: number;
	defaultTimeoutMs?: number;
	now?: () => number;
}

export class TurnLeaseTimeoutError extends Error {
	readonly sessionId: string;
	readonly ownerId: string;
	readonly timeoutMs: number;

	constructor(sessionId: string, ownerId: string, timeoutMs: number) {
		super(
			`Turn lease timed out after ${timeoutMs}ms for session ${sessionId}; the existing turn remains authoritative`,
		);
		this.name = "TurnLeaseTimeoutError";
		this.sessionId = sessionId;
		this.ownerId = ownerId;
		this.timeoutMs = timeoutMs;
	}
}

function boundedIdentity(value: string, name: string): void {
	if (!value || value.length > 512) throw new Error(`${name} must contain 1 to 512 characters`);
}

/** Serializes transcript mutation by resolved durable session ID. */
export class SessionTurnLeaseRegistry {
	private readonly leases = new Map<string, SessionLease>();
	private readonly maxEntries: number;
	private readonly defaultTimeoutMs: number;
	private readonly now: () => number;

	constructor(options: SessionTurnLeaseRegistryOptions = {}) {
		this.maxEntries = options.maxEntries ?? DEFAULT_MAX_LEASES;
		this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
		this.now = options.now ?? Date.now;
		if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1) {
			throw new Error("maxEntries must be a positive safe integer");
		}
		if (!Number.isFinite(this.defaultTimeoutMs) || this.defaultTimeoutMs < 0) {
			throw new Error("defaultTimeoutMs must be a non-negative finite number");
		}
	}

	get size(): number {
		return this.leases.size;
	}

	async acquire(
		sessionId: string,
		ownerId: string,
		generation: number,
		timeoutMs = this.defaultTimeoutMs,
	): Promise<SessionTurnLeaseToken> {
		boundedIdentity(sessionId, "sessionId");
		boundedIdentity(ownerId, "ownerId");
		if (!Number.isSafeInteger(generation) || generation < 1) {
			throw new Error("generation must be a positive safe integer");
		}
		if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
			throw new Error("timeoutMs must be a non-negative finite number");
		}
		const token: SessionTurnLeaseToken = {
			sessionId,
			ownerId,
			generation,
			capability: randomBytes(32).toString("base64url"),
			released: false,
		};
		const lease = this.getOrCreate(sessionId);
		if (!lease.holder) {
			lease.holder = token;
			lease.lastUsed = this.now();
			return token;
		}
		return await new Promise<SessionTurnLeaseToken>((resolve, reject) => {
			const waiter: LeaseWaiter = {
				token,
				settled: false,
				resolve,
				reject,
				timer: setTimeout(() => {
					if (waiter.settled) return;
					waiter.settled = true;
					const index = lease.waiters.indexOf(waiter);
					if (index !== -1) lease.waiters.splice(index, 1);
					reject(new TurnLeaseTimeoutError(sessionId, ownerId, timeoutMs));
				}, timeoutMs),
			};
			waiter.timer.unref();
			lease.waiters.push(waiter);
		});
	}

	release(token: SessionTurnLeaseToken | undefined): boolean {
		if (!token || token.released) return false;
		token.released = true;
		const lease = this.leases.get(token.sessionId);
		if (!lease || lease.holder !== token) return false;
		lease.holder = undefined;
		lease.lastUsed = this.now();
		this.grantNext(lease);
		return true;
	}

	rebind(token: SessionTurnLeaseToken | undefined, newSessionId: string): boolean {
		if (!token || token.released || !newSessionId || newSessionId === token.sessionId) return false;
		boundedIdentity(newSessionId, "newSessionId");
		const lease = this.leases.get(token.sessionId);
		if (!lease || lease.holder !== token) return false;
		const target = this.leases.get(newSessionId);
		if (
			target &&
			target !== lease &&
			(target.holder !== undefined || target.waiters.some((waiter) => !waiter.settled))
		) {
			return false;
		}
		this.leases.set(newSessionId, lease);
		lease.lastUsed = this.now();
		token.sessionId = newSessionId;
		return true;
	}

	private getOrCreate(sessionId: string): SessionLease {
		const existing = this.leases.get(sessionId);
		if (existing) {
			existing.lastUsed = this.now();
			return existing;
		}
		this.evictIdle();
		const lease: SessionLease = { waiters: [], lastUsed: this.now() };
		this.leases.set(sessionId, lease);
		return lease;
	}

	private grantNext(lease: SessionLease): void {
		while (lease.waiters.length > 0) {
			const waiter = lease.waiters.shift();
			if (!waiter || waiter.settled) continue;
			waiter.settled = true;
			clearTimeout(waiter.timer);
			lease.holder = waiter.token;
			lease.lastUsed = this.now();
			waiter.resolve(waiter.token);
			return;
		}
	}

	private evictIdle(): void {
		const overflow = this.leases.size - this.maxEntries + 1;
		if (overflow <= 0) return;
		const idle = [...this.leases.entries()]
			.filter(([, lease]) => !lease.holder && !lease.waiters.some((waiter) => !waiter.settled))
			.sort((left, right) => left[1].lastUsed - right[1].lastUsed);
		for (const [sessionId] of idle.slice(0, overflow)) this.leases.delete(sessionId);
	}
}
