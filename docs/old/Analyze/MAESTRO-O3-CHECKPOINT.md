# Maestro O1–O3 Hermes checkpoint

**Date:** 2026-07-28

**Hermes source:** local clean checkout at `5b22bd955682a8fc7b07769784c5129e23f53eaf`.

## Scope reviewed

- `agent/subagent_lifecycle.py` and `tests/agent/test_subagent_lifecycle.py`
- `agent/iteration_budget.py` and its race tests
- `agent/delegation_context.py`
- `gateway/turn_lease.py` and `tests/gateway/test_turn_lease.py`
- Hermes atomic JSON replacement utility
- Hermes gateway graceful-wait/forced-termination path
- Hermes PID plus process-start-time ownership checks used by durable delivery

## Retained because Hermes supplies the invariant

| Recode behavior | Hermes provenance | Decision |
|---|---|---|
| Versioned immutable handles/status/results instead of executor objects | Public subagent lifecycle contract | Keep |
| Bounded launch metadata, summaries and errors | Lifecycle request/result validation | Keep |
| Parent-scoped correlation uniqueness | Lifecycle registry | Keep |
| Capability-checked forged-handle rejection | Lifecycle HMAC check | Keep; Recode uses a stored random capability rather than Hermes's process-local HMAC |
| Pending/running/cancel-requested/terminal state semantics | `SubagentState` | Keep |
| Bounded wait, cooperative cancellation and already-terminal/unknown results | Lifecycle service/tests | Keep |
| Result hash and bounded terminal retention | Lifecycle result/registry cleanup | Keep |
| Atomic temp-file, flush and replace | `atomic_json_write` | Keep |
| PID plus process-start receipt, never PID alone | Durable delivery ownership checks | Keep as the O5 reconnect/adoption gate |
| Grace period followed by force termination and a false outcome when the process remains | `_wait_for_gateway_exit` | Keep and persist the result |
| Generation-checked stale ownership rejection | Turn-lease identity/generation checks | Keep for attachment cancellation and O4 lease release |

## Recode-specific behavior retained

Hermes's public subagents run in-process; Maestro owns separate RPC processes and local IPC clients. The following additions are therefore necessary adapters, not speculative parity work:

- a deadline and pending-map cleanup for every response-bearing RPC command;
- one active prompt and bounded pending commands per child;
- bounded child stdout/stderr and local IPC message/request queues;
- best-effort RPC `abort` when a prompt deadline or local signal fires;
- bounded `SIGTERM`/`SIGKILL` process shutdown with verified persisted outcome;
- bounded live sessions/subscribers and concurrent multi-instance shutdown;
- validated current/backup manifests and explicit corruption diagnostics.

These directly cover failure modes that Hermes's in-process lifecycle service cannot exercise.

## Removed at this checkpoint

- Removed the now-unused `removeInstance()` persistence path. Terminal records are retained by contract, and preserving a deletion helper invited accidental regression to lossy stop behavior.

## Deferred rather than imported

- Hermes delegation aggregation, cost/memory hooks and completion delivery belong to O6.
- Iteration-budget integration remains separate from process shutdown and will be added at its planned lifecycle integration boundary.
- Turn-lease registry/rebind behavior belongs to O4. Hermes's timeout fail-open behavior remains explicitly rejected.
- Symlink/ownership preservation from Hermes's general configuration writer is deferred to O7 workspace/deployment safety; Maestro manifests currently use an isolated service-owned directory and restrictive files.
- Hermes gateway profile multiplexing, service-manager integration, cgroup cleanup and product-specific environment scrubbing are not part of O1–O3.

## Checkpoint conclusion

O1–O3 contain no copied Hermes executor or broad gateway subsystem. The retained code is limited to public lifecycle invariants plus concrete process/IPC adapters required by Recode's architecture. O2–O3 are ready to commit after focused tests, repository checks and task-local diff review pass.
