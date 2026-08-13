# Orchestrator Plan

## Purpose

Define a minimal, Recode-first path for making `packages/orchestrator` the supervisor for full concurrent Aizen sessions without bloating core runtime code. This plan compares the current Recode orchestrator with Nous Research's Hermes Agent at commit `d71033a4077a6dfdcdb42c9e9eeab4c41e4a7012`.

## Constraint from CONTRIBUTING.md

`CONTRIBUTING.md` says pi core is minimal and features that do not belong in core should be extensions. It also warns that even extension hook points must be carefully discussed to avoid unmaintainable bloat and complex interactions.

For this repository, that means orchestrator work should:

- extend the existing `packages/orchestrator` package instead of adding another supervisor;
- keep ordinary foreground Aizen and named workers simple;
- add only small protocol/state primitives that are needed for durable full-session concurrency;
- avoid importing Hermes's broad gateway, learning loop, scheduler, multi-backend runtime, or memory machinery.

## Current Recode foundation

`packages/orchestrator` already has the right skeleton:

- `OrchestratorSupervisor` tracks live instances in memory and persisted records (`packages/orchestrator/src/supervisor.ts:63-88`).
- It binds RPC process events to subscribers and routes one UI-request handler (`packages/orchestrator/src/supervisor.ts:99-112`).
- It supports RPC streams with event subscribers and UI responses (`packages/orchestrator/src/supervisor.ts:197-232`).
- It spawns one coding-agent RPC child per instance (`packages/orchestrator/src/supervisor.ts:270-298`, `packages/orchestrator/src/rpc-process.ts:37-60`).
- It has basic spawn/list/status/stop/rpc/rpc_stream protocol messages (`packages/orchestrator/src/ipc/protocol.ts:10-50`).

Main gaps:

- Persistence rewrites JSON directly and non-atomically (`packages/orchestrator/src/storage.ts:45-69`).
- Restart recovery marks live/starting instances stopped and does not reattach or preserve ownership receipts (`packages/orchestrator/src/supervisor.ts:244-254`).
- Status is process-lifecycle-oriented only: `starting | online | stopping | stopped | error` (`packages/orchestrator/src/types.ts`). It does not represent `running`, `waiting-input`, `completed`, or `cancelled`.
- Stop is destructive from the supervisor perspective: it disposes the child and removes the instance record (`packages/orchestrator/src/supervisor.ts:300-318`). This is not the same as detach.
- RPC process disposal sends `SIGTERM` and waits indefinitely for exit (`packages/orchestrator/src/rpc-process.ts:186-195`).
- Only one UI-request callback is stored; multiple read-only subscribers exist, but interactive ownership is implicit (`packages/orchestrator/src/supervisor.ts:21-28`, `197-232`).

## Hermes evidence to take seriously

Hermes is much larger than Recode should become, but several small patterns are useful:

1. **Context-local child lineage, not global mutation.** Hermes marks delegated child execution with a context variable and only propagates a scrubbed environment to subprocesses when needed. Evidence: [`agent/delegation_context.py`](https://github.com/NousResearch/hermes-agent/blob/d71033a4077a6dfdcdb42c9e9eeab4c41e4a7012/agent/delegation_context.py#L1-L85).

2. **Independent bounded budgets.** Hermes gives each subagent its own iteration budget with a small thread-safe counter. Evidence: [`agent/iteration_budget.py`](https://github.com/NousResearch/hermes-agent/blob/d71033a4077a6dfdcdb42c9e9eeab4c41e4a7012/agent/iteration_budget.py#L1-L62).

3. **Runaway delegation guardrails.** Hermes counts spawned subagents, not just delegate calls, and blocks runaway delegation loops. Evidence: [`agent/tool_guardrails.py`](https://github.com/NousResearch/hermes-agent/blob/d71033a4077a6dfdcdb42c9e9eeab4c41e4a7012/agent/tool_guardrails.py#L483-L624).

4. **Batch only independent work.** Hermes keeps the model guidance short: batch independent reads/searches, serialize dependent work. Evidence: [`agent/prompt_builder.py`](https://github.com/NousResearch/hermes-agent/blob/d71033a4077a6dfdcdb42c9e9eeab4c41e4a7012/agent/prompt_builder.py#L354-L386).

5. **Worktree context should be minimal and non-confusing.** Hermes tells the model that a checkout is a linked worktree without exposing extra absolute paths that could cause commands in the wrong directory. Evidence: [`agent/coding_context.py`](https://github.com/NousResearch/hermes-agent/blob/d71033a4077a6dfdcdb42c9e9eeab4c41e4a7012/agent/coding_context.py#L895-L908).

## What Recode should take from Hermes

### 1. Minimal instance lineage and ownership receipts

Add lightweight fields to `InstanceRecord`:

- `parentInstanceId?: string`
- `ownerPid?: number`
- `ownerStartedAt?: string`
- `processPid?: number`
- `processStartedAt?: string`
- `runState?: "idle" | "running" | "waiting-input" | "completed" | "cancelled" | "error"`
- `interactiveOwnerId?: string`
- `outputTail?: string[]` with a hard line/byte cap

Purpose: make attach/detach and restart recovery explicit without adopting unverifiable orphan processes.

### 2. Atomic persistence before richer behavior

Replace direct `writeFileSync(path, json)` with temp-file write, fsync where practical, and rename. Add bounded recovery behavior:

- valid current file wins;
- if current file is corrupt but `.bak` is valid, load `.bak` and mark all live instances stopped/error with recovery metadata;
- never delete records for stopped/completed instances until a retention policy exists.

This is small and prevents supervisor state loss from corrupting all instance records.

### 3. Attach/detach as protocol, not another runtime

Extend the IPC protocol with:

- `attach { instanceId, interactiveOwnerId }`
- `detach { instanceId, interactiveOwnerId }`
- `cancel { instanceId, commandId? }`
- `send { instanceId, text }` if a higher-level prompt shortcut is needed

Rules:

- one interactive owner at a time;
- read-only event subscribers are allowed;
- closing a TUI stream detaches, it does not stop the child;
- a detached instance that requests user input becomes `waiting-input`;
- stop remains explicit and destructive.

### 4. Bounded concurrency and budgets

Add small admission controls:

- max live full Aizen sessions;
- max concurrently `running` sessions;
- per-instance command timeout/cancel path;
- bounded output tail and event queue.

This mirrors Hermes's budget/guardrail idea, but keeps it at the process-supervisor layer instead of adding a generalized subagent framework.

### 5. Worktree safety for write-capable sessions

Default background sessions should be read-only in the selected workspace. Write-capable concurrent full sessions require an explicit sibling worktree that shares the same Git common directory.

Do not expose multiple absolute checkout paths to the model unless the user explicitly selected one. Surface only:

- current workspace;
- whether it is a linked worktree;
- branch and dirty summary;
- write capability state.

### 6. Completion handoff queue

Persist bounded completion summaries and inject them into foreground Aizen only as fresh, explicitly untrusted handoff entries at a safe turn boundary.

Do not mutate prior turns. Do not expose private worker transcripts. Do not silently merge background output into the active conversation.

## What Recode should not take from Hermes

Do not import these into core orchestrator work:

- Hermes's multi-platform gateway surface: Telegram, Discord, Slack, WhatsApp, Signal.
- Autonomous learning loop, user modeling, automatic skill creation, or periodic nudges.
- Cron scheduler and unattended automation framework.
- Broad terminal backend abstraction: Docker, SSH, Singularity, Modal, Daytona.
- Python-style global agent runtime refactors.
- Large prompt guidance blocks or model-specific behavior copied into the orchestrator.
- Deep nested delegation as a default architecture.
- Automatic worktree creation/cleanup.
- Background memory review or memory writes from workers/background sessions.

These are useful Hermes product features, but they are bloat for Recode's current core. Recode already has named workers, Kioku boundaries, browser boundaries, and an experimental orchestrator package; the right move is hardening those existing boundaries.

## Implementation phases

### O0 — Measure first

Add cheap timing/log counters for:

- orchestrator startup;
- spawn to first `get_state`;
- RPC request round trip;
- prompt start to first event;
- prompt completion;
- persistence write duration.

No architecture change should claim latency wins without these numbers.

### O1 — Persistence and records

- Add run-state fields and ownership receipt fields.
- Implement atomic JSON persistence.
- Keep old records readable through optional fields.
- Add tests for corrupt JSON recovery and non-lossy stopped-instance retention.

### O2 — Attach/detach protocol

- Add explicit protocol messages and supervisor methods.
- Enforce one interactive owner.
- Allow read-only subscribers.
- Convert stream close to detach only when attached as owner.
- Add tests for attach conflict, detach, read-only subscription, and waiting-input transition.

### O3 — Cancellation and bounded shutdown

- Add command-level cancellation if coding-agent RPC supports it; otherwise add instance-level cooperative cancel first.
- Bound `SIGTERM` wait and escalate only after timeout.
- Preserve record with `cancelled` or `error` state instead of removing it immediately.

### O4 — Workspace safety

- Add read-only/write-capable session mode.
- Reuse existing Git common-directory guard for sibling worktrees.
- Reject unrelated repositories, traversal, dirty destructive setup, and ambiguous ownership.
- Require explicit user approval before creating or using a write-capable sibling worktree.

### O5 — TUI integration

- Add a compact session picker: label, short id, cwd basename, run state, elapsed time, and pending input indicator.
- Attach/detach from picker.
- Show bounded output tail.
- Deliver completed background results as untrusted handoffs.

## Acceptance gates

- `packages/orchestrator` remains the only full-session supervisor.
- Ordinary foreground Aizen path is unchanged.
- Named workers remain lightweight in-process conversations.
- No new gateway, scheduler, memory writer, or learning system is added.
- Restart never kills/adopts unverifiable processes.
- Dirty user work is never reset, stashed, rebased, or deleted.
- Focused orchestrator tests pass.
- After code changes, `npm run check` passes.
