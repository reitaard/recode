import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SessionTurnLeaseRegistry, TurnLeaseTimeoutError } from "../src/turn-lease.ts";

async function nextTurn(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("durable-session turn leases", () => {
	it("serializes alias owners by resolved session while distinct sessions run independently", async () => {
		const registry = new SessionTurnLeaseRegistry();
		const first = await registry.acquire("session-1", "route-a", 1);
		const order = ["first"];
		const secondPromise = registry.acquire("session-1", "route-b", 1).then((token) => {
			order.push("second");
			return token;
		});
		const distinct = await registry.acquire("session-2", "route-c", 1);
		order.push("distinct");
		await nextTurn();
		assert.deepEqual(order, ["first", "distinct"]);
		assert.equal(registry.release(first), true);
		const second = await secondPromise;
		assert.deepEqual(order, ["first", "distinct", "second"]);
		assert.equal(registry.release(second), true);
		assert.equal(registry.release(distinct), true);
	});

	it("fails closed on timeout without stealing or degrading the held lease", async () => {
		const registry = new SessionTurnLeaseRegistry({ defaultTimeoutMs: 10 });
		const holder = await registry.acquire("session-timeout", "holder", 1);
		await assert.rejects(registry.acquire("session-timeout", "waiter", 2), TurnLeaseTimeoutError);
		const thirdPromise = registry.acquire("session-timeout", "third", 3, 100);
		await nextTurn();
		assert.equal(registry.release(holder), true);
		const third = await thirdPromise;
		assert.equal(third.ownerId, "third");
		assert.equal(registry.release(third), true);
	});

	it("makes release identity-scoped and idempotent across newer generations", async () => {
		const registry = new SessionTurnLeaseRegistry();
		const stale = await registry.acquire("session-generation", "owner", 1);
		assert.equal(registry.release(stale), true);
		assert.equal(registry.release(stale), false);
		const current = await registry.acquire("session-generation", "owner", 2);
		stale.released = false;
		assert.equal(registry.release(stale), false);
		const waiter = registry.acquire("session-generation", "other", 3);
		await nextTurn();
		assert.equal(registry.release(current), true);
		assert.equal(registry.release(await waiter), true);
	});

	it("rebinds a held lease across session rotation and blocks conflicting live domains", async () => {
		const registry = new SessionTurnLeaseRegistry();
		const rotating = await registry.acquire("parent-session", "route-a", 1);
		assert.equal(registry.rebind(rotating, "child-session"), true);
		assert.equal(rotating.sessionId, "child-session");
		const aliasWaiter = registry.acquire("child-session", "route-b", 1);
		await nextTurn();
		assert.equal(registry.release(rotating), true);
		assert.equal(registry.release(await aliasWaiter), true);

		const first = await registry.acquire("domain-a", "route-a", 2);
		const second = await registry.acquire("domain-b", "route-b", 2);
		assert.equal(registry.rebind(first, "domain-b"), false);
		assert.equal(first.sessionId, "domain-a");
		assert.equal(registry.release(first), true);
		assert.equal(registry.release(second), true);
	});

	it("evicts only idle entries and permits live entries to exceed the soft cap", async () => {
		let now = 0;
		const registry = new SessionTurnLeaseRegistry({ maxEntries: 3, now: () => ++now });
		const live = await registry.acquire("live", "owner", 1);
		for (let index = 0; index < 20; index += 1) {
			const token = await registry.acquire(`idle-${index}`, "owner", index + 1);
			registry.release(token);
		}
		assert.ok(registry.size <= 4);
		assert.equal(registry.release(live), true);
	});
});
