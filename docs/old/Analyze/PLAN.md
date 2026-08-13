# Recode performance and orchestration plan

The current prioritized user-facing gap backlog and acceptance gates are maintained in [`SHORTCOMINGS.md`](SHORTCOMINGS.md).

## Scope

This plan defines four ordered programs selected from the overall Recode/jcode comparison:

1. establish a measured package/startup architecture and materially reduce startup cost without disabling features;
2. port Hermes’s lifecycle subsystem into Recode and use it to turn the existing full-session supervisor into a reliable long-lived service;
3. compare frozen Recode, jcode and upstream Pi implementations at matched behavioral and performance contracts;
4. close the remaining distribution, memory, safety and integrated-product gaps while preserving Recode’s LSP, extension, exact-tool, worker and memory-governance advantages.

Startup is the first measured bottleneck, not the scope of the entire comparison. Each program begins with contracts, evidence and acceptance gates before implementation.

This plan is informed by:

- `analyze/REPIAUDIT.md` and `analyze/COMPARE.md`;
- `update/orchestrator.md` and the accepted architecture in `update/DECISIONS.md`;
- current Recode `packages/orchestrator` source;
- upstream Pi `packages/server` at `c820aa26fe0907e053e881a957722693fc094c9c`;
- Hermes Agent at historical reviewed commits plus current `5b22bd955682a8fc7b07769784c5129e23f53eaf`.

The ordinary foreground Aizen path and lightweight named workers remain supported. Full background Aizen sessions are a separate supervisor concern.

## Architecture decision

Perform a **faithful port of Hermes’s public lifecycle contract and state machine**, then bind it to Recode through an explicit execution adapter. Keep the existing Recode/Pi process supervisor as the backend for full Aizen sessions and keep Recode’s completed named-worker implementation.

Hermes is not based on Pi. It has its own `AIAgent` runtime, in-process registry, daemon thread pool and delegate construction. The lifecycle code therefore cannot be pasted unchanged and compiled inside Recode. The port must preserve its observable contract and invariants while replacing Hermes-specific execution calls with Recode adapters.

Hermes is MIT licensed. Any copied or closely translated implementation must preserve required license/attribution notices and record the exact source commit and source files.

### Why keep the Recode/Pi substrate

`packages/orchestrator` already speaks the coding-agent RPC protocol, owns child processes, routes events and UI requests, and records session metadata. Upstream later renamed this package to `packages/server` and released it as `@earendil-works/pi-server` with a `server` binary.

That upstream release is useful provenance, but it is not proof of production hardening. Its README still marks the package experimental, and current upstream retains the same major defects:

- RPC requests have no deadline;
- shutdown sends `SIGTERM` and can wait forever;
- JSON state is rewritten non-atomically;
- stopped records are deleted;
- restart recovery cannot verify or reattach children;
- attach/detach is absent;
- no package tests cover the supervisor.

Before implementation, compare three lines and port only proven deltas:

1. current `packages/orchestrator`;
2. upstream `packages/server`;
3. `origin/phase-4a-target-routing`, which contains later target-routing contracts and tests.

Do not create another supervisor package or maintain two competing implementations.

### Hermes lifecycle port boundary

Port these contracts and invariants from Hermes:

- immutable public handles rather than exposing live runtime objects;
- explicit states: pending, starting, running, waiting-input, succeeded, failed, interrupted, cancel-requested, cancelled and unknown;
- launch, status, wait, cancel, result and reconnect operations;
- versioned contract fields and capability/ownership validation;
- parent session/instance lineage and correlation-ID uniqueness;
- bounded goals, context, metadata, progress tails and result payloads;
- terminal-result retention instead of immediate deletion;
- bounded concurrency and independent per-child budgets;
- background progress and completion events grouped by parent session;
- stale-owner protection so an old detach/cancel/release cannot affect a newer owner.

Also port the relevant gateway invariant as a separate component:

- per-resolved-session turn leases so two clients cannot concurrently mutate one transcript;
- generation-aware lease release and session-id rotation/rebind handling.

### Recode execution adapters

Implement the port against two adapters rather than mixing runtime-specific code into the lifecycle service:

1. **Worker adapter:** wraps the existing completed Mayuri/Levi/Shiori conversation directory. It does not rewrite worker internals or change their modal/private-chat behavior.
2. **Full-session adapter:** wraps an orchestrator-owned coding-agent RPC child process and adds durable process identity, attach/detach and verified restart behavior.

Both adapters expose the same lifecycle vocabulary where behavior is genuinely equivalent. Full-session-only operations such as process reconnect and interactive attachment remain capability-gated rather than faked for workers.

### Hermes code that remains outside the port

Hermes’s current lifecycle registry and executor are in-process, and its own documentation states that serialized subagent handles cannot reconnect after a process restart. Those execution internals cannot satisfy Recode’s durable full-session requirement.

Do not port Hermes’s messaging gateway, schedulers, automatic learning, broad terminal backends or memory automation as part of this work. They are separate product systems, not lifecycle dependencies.

---

# Track 1 — Startup measurement and optimization

## Current evidence

### Existing benchmark

The isolated/offline RPC benchmark currently reports approximately:

- warm median: **1.5 seconds**;
- observed first isolated launch: **28.9 seconds**.

The benchmark waits for a real `get_state` response, but its timing parser looks for `--- Startup Timings ---` while Recode emits `--- Startup Timings: main ---` and `--- Startup Timings: extensions ---`. Phase data is therefore silently omitted.

### Configured-runtime trace

A direct configured RPC trace on 2026-07-28 measured:

**Cold configured process**

- total startup phases: **40,305 ms**;
- `createAgentSessionRuntime`: **40,281 ms**;
- extension total: **40,030 ms**;
- `pi-web-access` module import: **8,280 ms**;
- `pi-mcp-adapter` module import: **20,762 ms**;
- RePi/OpenClaw browser entry import: **9,414 ms**;
- Recode open-provider factory: **1,067 ms**;
- OpenAI OAuth factory: **460 ms**.

**Immediate warm configured process**

- total startup phases: **2,519 ms**;
- `createAgentSessionRuntime`: **2,506 ms**;
- extension total: **2,309 ms**.

The dominant problem is runtime loading/initialization of installed feature packages, not argument parsing, session-file creation, theme setup or the base RPC loop. The exact costs must be reproduced before changes, but the optimization target is now concrete.

## S0 — Repair measurement first

### Work

- Fix `scripts/profile-coding-agent-node.mjs` to parse named timing groups.
- Emit one machine-readable JSON artifact per benchmark run containing:
  - source commit and package version;
  - runtime and platform versions;
  - mode and lifecycle endpoint;
  - isolated/configured and cold/warm classification;
  - every timing namespace/phase;
  - elapsed wall time;
  - loaded extension/package names without credentials or user-entered values.
- Add lifecycle metrics for:
  - process start to first TUI frame;
  - process start to input echo;
  - process start to RPC `get_state`;
  - session selected/restored;
  - prompt accepted;
  - provider request sent;
  - first model event/token.
- Keep benchmarking offline except for an explicitly selected first-token test.
- Add a regression proving named timing groups are retained in benchmark output.

### Gate

Cold and warm results can be reproduced for both isolated and normal configured state. No optimization begins until phase data is present in the artifact.

## S1 — Establish representative baselines

Run a small controlled matrix, not a large test flood:

| Mode | State | Runs |
|---|---|---:|
| RPC `get_state` | isolated cold/warm | 1 cold + 5 warm |
| RPC `get_state` | configured cold/warm | 1 cold + 5 warm |
| TUI first frame/input | isolated and configured | 1 cold + 5 warm |
| First model token | configured, one fixed provider/model | 3 warm |

Also capture CPU profiles only for the slowest cold configured run and median warm configured run.

### Gate

The baseline identifies the top three startup costs by wall time and separates core startup from installed-package startup.

## S2 — Define a release-grade package runtime architecture

Do not solve the 40-second path by disabling packages, reducing timeouts, hiding errors or adding one-off lazy imports. The installed package system needs a formal runtime contract.

### Package artifact contract

- A release package provides a built runtime entrypoint, source map, package identity, content hash and compatibility version.
- Runtime source transpilation is a development capability, not the default release execution path.
- Installation verifies the declared entrypoint and records the exact artifact hash.
- Package loading reports separate resolve, verify, module-load, registration and backend-readiness phases.
- Existing source-only packages remain supported through an explicit compatibility path with visible performance diagnostics; no silent cache is treated as a release artifact.

### Declarative activation contract

Introduce an optional package manifest that can declare stable metadata without executing the complete backend:

- tool/command/provider identifiers;
- schema/version compatibility;
- required permissions and project-trust level;
- backend service dependencies;
- whether activation is process-local, service-shared or session-local;
- readiness and shutdown contracts.

Dynamic extensions remain supported. The manifest is an optimization and validation boundary, not a weaker replacement for the extension API.

### Deterministic activation

- Preserve deterministic registration order.
- Parallelize only verified independent artifact reads and validation.
- Never parallelize factories merely because it benchmarks faster; ordering and side effects must be modeled first.
- A package is not reported ready until its declared readiness contract passes.

### Shared integration services

MCP, browser and provider discovery should have explicit service lifecycles rather than repeating opaque initialization inside every session:

- the long-lived Recode service owns shared stateless backends;
- stateful backends declare per-session ownership;
- each backend exposes start, readiness, health, reconnect and shutdown operations;
- clients receive accurate `initializing`, `ready`, `degraded` or `error` state;
- guarded actions remain unavailable until the required backend is genuinely ready;
- validated provider catalogues may be persisted with source, timestamp and compatibility metadata, then refreshed by the owning service rather than rediscovered independently by every client.

### Kioku service lifecycle

- Treat the approved Markdown files as source of truth and the SQLite index as a rebuildable service artifact.
- Open and validate an existing project-correct index through a defined lifecycle.
- Reconciliation may run concurrently only after index identity, schema and project root are verified.
- First construction, migration and corruption recovery remain observable and cancellable; another project’s index is never accepted as fallback.

### First-party browser requirement

`repi-browser` is a required first-party Recode package even while its repository/package remains private. It is the first controlled package targeted for the built artifact/runtime-contract migration. Private status must not exclude browser capability from certified Recode artifacts or the later three-way checkpoint. Public redistribution remains blocked until its license/distribution terms are explicit.

### Gate

All configured tools, providers, browser operations, MCP servers, memory scope, project-trust checks and shutdown behavior remain available. Performance comes from a defined artifact/service architecture and shared ownership, not skipped initialization or hidden failures. The certified package set includes `repi-browser` with exact source/artifact identity.

## S3 — Split lifecycle readiness levels

Define and test these readiness levels:

1. **frame-ready:** TUI rendered;
2. **input-ready:** editor accepts input;
3. **session-ready:** selected session and local tools are usable;
4. **integration-ready:** configured extension backends completed initialization;
5. **model-ready:** provider request can start.

Do not delay level 1–3 for optional level-4 integrations.

## S4 — Ratify performance targets after the three-way checkpoint

Do not ratify final absolute SLOs from Recode-only measurements. Set them after Track 3 compares exact Recode, jcode and upstream Pi revisions at matched lifecycle endpoints. Initial acceptance target:

- at least **70% reduction** in configured cold startup;
- at least **50% reduction** in configured warm startup;
- no regression above 10% in isolated startup;
- no lost tools, providers, memory scope, worker capability or project-trust checks.

The long-lived service in Track 2 should make subsequent attaches faster, but it must not be used to hide an unbounded cold-start path.

---

# Track 2 — Hermes lifecycle port and long-lived Recode service

## O0 — Freeze the contract and characterize inherited behavior

### Work

- Produce a three-way source report for current orchestrator, upstream Pi server and the Phase 4A routing branch.
- Import only reviewed fixes/contracts; preserve Recode package identity.
- Add characterization tests before refactoring:
  - spawn and first `get_state`;
  - event streaming;
  - UI request/response routing;
  - unexpected child exit isolation;
  - stop behavior;
  - current restart recovery behavior.
- Freeze the accepted CLI contract without creating a second package implementation: `recode maestro <command>` for the full-session conductor, `recode aizen` for explicit Aizen, and direct `recode worker <name>` plus stable worker aliases. Characterize the existing `--aizen` flag in O0, then remove it at O1 entry as approved.
- Freeze the Hermes port source at commit `5b22bd955682a8fc7b07769784c5129e23f53eaf` and review:
  - `agent/subagent_lifecycle.py`;
  - `agent/iteration_budget.py`;
  - `agent/delegation_context.py` where lineage behavior applies;
  - `gateway/turn_lease.py`;
  - corresponding lifecycle, lease and budget tests.
- Record a port mapping that classifies each Hermes field, state, invariant and test as `direct-port`, `adapted`, `full-session-extension` or `excluded`, with rationale.

### Gate

The existing Recode behavior is reproducible under tests, every upstream/Phase 4A delta selected for porting has an explicit reason, and the Hermes port mapping has no unreviewed lifecycle behavior.

## O1 — Port the public lifecycle model

**Status:** complete — 2026-07-29. `MaestroLifecycleService` and `MaestroFullSessionLifecycleAdapter` now own the production full-session launch, cancellation, attachment, waiting-input, result, and stop path over the existing supervisor backend. The named-worker adapter remains the conformance boundary for lightweight in-process workers rather than creating a second process supervisor.

Translate Hermes’s versioned lifecycle contract and state machine into Recode’s coding conventions. Preserve operation names and state semantics unless a documented Recode requirement forces a difference:

```text
launch(request) -> handle
status(handle) -> status
wait(handle, timeout) -> terminal status
cancel(handle, reason, optional command id) -> cancel result
result(handle) -> bounded result
reconnect(handle) -> verified reconnect result
attach(handle, owner id) -> attachment
subscribe(handle) -> read-only event stream
detach(attachment) -> result
stop(handle) -> destructive terminal operation
```

### Required record fields

- contract version;
- instance id and correlation id;
- parent instance/session id;
- cwd/worktree identity;
- process PID plus verifiable process-start receipt;
- session id/file;
- lifecycle state and timestamps;
- interactive owner generation;
- bounded progress/output tail;
- bounded terminal result/error summary.

Never persist credentials, prompts, complete tool outputs or environment secrets in the supervisor manifest.

### Port conformance

Translate the relevant Hermes tests into Recode-focused conformance tests rather than inventing expected behavior from scratch. Cover:

- request bounds and malformed handles;
- correlation-ID uniqueness;
- every legal and illegal state transition;
- status/wait/result behavior before and after completion;
- cancellation races and already-terminal cancellation;
- terminal retention and expiry;
- stale capability/ownership rejection;
- iteration-budget races;
- turn-lease acquisition, stale release and session-id rebind.

Add Recode-specific tests only for adapter behavior that Hermes does not provide: process identity, RPC failure, attach/detach and verified restart.

### Gate

Callers never receive a live child-process object. Invalid, stale or forged handles fail closed. The port passes the translated Hermes conformance suite against both the worker adapter and every operation supported by the full-session adapter.

## O2 — Atomic persistence and terminal retention

### Work

- Replace direct whole-file writes with temp write, flush where practical, atomic rename and bounded backup recovery.
- Validate schema and bounds before accepting persisted records.
- Preserve succeeded, failed and cancelled records for a defined retention period instead of deleting them on stop.
- Make corrupt-state recovery explicit and observable.
- Never adopt or kill a process whose identity receipt cannot be verified.

### Gate

Tests cover interrupted writes, corrupt current file, valid backup recovery, stale PID reuse, and non-lossy terminal retention.

## O3 — Deadlines, cancellation and shutdown

**Status:** complete — 2026-07-29. In addition to bounded RPC/process behavior, every Aizen and named-worker run now receives an independent race-safe provider-call iteration budget.

### Work

- Add a deadline to every RPC request and remove timed-out requests from the pending map.
- Support command-scoped cancellation where coding-agent RPC permits it.
- Add instance-level cooperative cancellation.
- On destructive stop: request graceful shutdown, wait a bounded interval, escalate, then record the verified outcome.
- A stale cancellation token or attachment generation must never cancel a newer run.
- Bound live sessions, concurrently running prompts, event queues, output tails and result sizes.

### Gate

A hung child cannot hang spawn, stop, service shutdown or another instance. Cancellation results distinguish requested, accepted, completed, unsupported and unknown.

## O4 — Session turn lease

Adopt Hermes’s strongest gateway lesson: ownership must follow the resolved durable session, not merely the client connection.

### Work

- Permit only one mutating prompt/turn lease per resolved session id.
- Allow multiple read-only event subscribers.
- Rebind the lease safely when compaction/session rotation changes the session id.
- Use generation tokens so stale release/detach operations cannot free a newer owner’s lease.
- Do not fail open into simultaneous transcript mutation. A timed-out lease becomes an explicit recoverable error requiring user action.

### Gate

Two clients cannot interleave writes into one session transcript, including across resume aliases and compaction rotation.

## O5 — Attach, detach and waiting input

### Work

- One interactive approval/input owner per live instance; many read-only subscribers.
- Closing a client detaches and leaves the child alive.
- Explicit stop remains destructive.
- A detached session requesting UI input transitions to `waiting-input`.
- Reattachment receives current state plus a bounded event/output tail, not an unbounded replay.
- Reconnect after service restart succeeds only when the process identity and session receipt are verifiable; otherwise report `unknown/stopped` without adoption.

### Gate

Client loss does not kill the session, duplicate owners are rejected, and restart never adopts an unrelated process.

## O6 — Completion queue and Aizen handoff

**Status:** complete — 2026-07-29. Queue, claim/ack and Aizen handoff primitives are connected to real supervised child terminal transitions with one idempotent durable record per child result.

### Work

- Persist bounded completion summaries keyed by parent/root session.
- Deliver completion as a fresh, explicitly untrusted handoff at Aizen’s next safe turn boundary.
- Preserve a link/id to the full child session rather than copying its private transcript.
- Make delivery idempotent with acknowledgement state.

### Gate

A restart or reconnect cannot duplicate, lose or silently inject a completion into prior conversation history.

## O7 — Workspace safety

**Status:** complete — 2026-07-28

- Read-only background sessions may share the selected workspace.
- Concurrent write-capable full sessions require an explicitly selected sibling worktree sharing the same Git common directory.
- Never create, merge, reset, stash or delete a worktree automatically.
- Persist worktree ownership receipts and refuse ambiguous cleanup.
- Show the agent only its active workspace and minimal linked-worktree context.

## O8 — Core service supervision and TUI integration

**Status:** complete — 2026-07-29

First harden Maestro as the single core Windows/Linux service boundary:

- add one verified service owner with readiness, health and restart-loop diagnostics;
- support systemd on Linux and a reviewed native startup path on Windows;
- use option A restart semantics: planned stop or restart drains within a deadline, then terminates all owned child processes;
- distinguish planned stop, degraded adapter state and process crash;
- never run a fallback watcher concurrently with native service supervision.

Then add a compact live-session view containing:

- label and short id;
- workspace/branch;
- state and elapsed time;
- current activity;
- pending input indicator;
- bounded latest output;
- attach, detach, cancel and stop actions.

Keep ordinary foreground Aizen startup available when the service is disabled or unavailable. Named workers remain lightweight conversations and do not become OS processes.

## O9 — Shared-service performance

Only after lifecycle correctness and the Track 3 three-way checkpoint:

- reuse immutable model/provider metadata;
- reuse parsed static configuration and package manifests;
- share read-only Kioku indexes safely;
- cache stable tool schemas/system-prompt prefixes;
- keep credentials and mutable AgentSession state isolated per instance.

Track service startup separately from client attach time. Do not claim startup improvement by measuring only an already-running daemon without also publishing daemon cold-start cost.

---

# Track 3 — Exact three-way test and performance checkpoint

Run this checkpoint only after O0–O8 pass their gates. Its purpose is to compare implemented behavior, not README feature lists or language choices.

## C0 — Freeze exact comparison sources

**Status:** complete for the 2026-07-30 checkpoint. Recode, jcode `v0.54.4`, upstream Pi and Hermes provenance are recorded in `analyze/COMPARE.md` with exact commits and artifact hashes where executed.

- Record the Recode commit and dirty-state fingerprint used for the checkpoint.
- Clone jcode into a fresh temporary directory and record its exact commit.
- Fetch upstream `earendil-works/pi` without changing the Recode branch and record its exact commit.
- Retain the Hermes source commit and port mapping as lifecycle provenance, but keep the product comparison three-way: Recode, jcode and upstream Pi.
- Never compare moving branch names or silently reuse an older temporary clone.

### Gate

Every result names an exact source commit, runtime/toolchain version, platform and lifecycle endpoint.

## C1 — Map test contracts before counting tests

**Status:** complete for the current checkpoint. The refreshed comparison covers lifecycle/readiness, sessions, workers, memory, tools/LSP, browser/MCP, safety, providers, distribution and user experience rather than raw test counts.

Create a three-way contract matrix covering:

- process/frame/input/session/integration/model readiness;
- session create, resume, branch and persistence;
- lifecycle states, wait, cancellation, results and retention;
- attach/detach, read-only subscription and restart recovery;
- stale ownership, turn leases and concurrent transcript mutation;
- workspace/worktree boundaries;
- extension/package activation and shutdown;
- MCP and browser readiness/failure behavior;
- worker/subagent isolation, cancellation and completion delivery.

Compare behavioral assertions and failure cases, not raw test counts. Mark documentation-only, proposed, ignored, environment-gated and untested behavior separately from passing implementation tests.

### Gate

Each claimed feature maps to source plus at least one executable test, or is explicitly classified as unverified.

## C2 — Run native and translated conformance suites

**Status:** partial. Recode focused conformance is retained; jcode source and the verified release binary were inspected, but native Rust tests remain unavailable without a Rust toolchain. Unsupported execution is recorded rather than treated as passing.

- Run each project’s focused native tests for mapped contracts using its documented toolchain.
- Translate only implementation-independent contract cases into a small shared fixture format.
- Run translated Hermes lifecycle conformance against Recode’s worker and full-session adapters.
- Run equivalent lifecycle cases against jcode and upstream Pi where their public contracts support them; record unsupported operations rather than fabricating adapters.
- Keep real-provider tests separate from deterministic faux-provider tests.

### Gate

The report distinguishes product defects, unsupported features, test-harness differences and environment failures.

## C3 — Run matched performance probes

**Status:** partial. Exact jcode warm daemon-control latency and the Recode cold-spawn timeout defect were observed. jcode cold start hit the probe deadline and was rejected; unmatched first-frame/session-ready values are not ratio-compared.

On the same machine, compare only equivalent endpoints:

- process start to first rendered frame;
- process start to rendered input echo;
- process start to session-ready;
- process start to integration-ready;
- cold service start;
- warm client attach to an existing service;
- prompt accepted to provider dispatch;
- provider dispatch to first model event using the same provider/model when supported.

Publish cold, warm and uncontrolled cache states separately. A persistent-server client result must include the corresponding server cold-start result.

### Gate

No headline ratio combines unlike lifecycle points, cache states, provider models or already-running service state.

## C4 — Gap decision

**Status:** complete for product prioritization. `analyze/COMPARE.md` records adopt/preserve/reject decisions and the measured V2/V3 order. Absolute cross-product SLO ratification remains pending matched native probes.

Write one evidence-backed checkpoint report that decides:

- which jcode or upstream Pi contracts Recode should adopt;
- which Recode behavior remains intentionally different;
- which defects block the next checkpoint;
- final S4 startup SLOs;
- the measured O9 shared-service optimization order.

No code is copied merely because another project has more tests. Port only reviewed behavior with compatible licensing and explicit attribution.

---

# Track 4 — Overall product gap closure

Track 4 is derived from [`analyze/COMPARE.md`](COMPARE.md) and is intentionally broader than startup. C4 must re-rank it using executable evidence, but the known gaps remain explicit meanwhile.

## P0 — Coherent first-party distribution and identity

- certify one reproducible Windows/Linux/Termux release set;
- include `repi-browser` even while privately distributed, with exact identity and runtime contract;
- provide explicit default/recommended MCP and browser package policy;
- finish `recode` command/documentation identity;
- restore trusted publication before any public release.

## P1 — Preserve and strengthen Recode’s current advantages

- retain first-class LSP and exact edit behavior;
- retain SDK, extension and package compatibility;
- retain bounded named workers and controlled memory admission;
- add conformance tests so performance/service changes cannot weaken these capabilities.

## P2 — Safety gap

**Status:** local control-plane phase complete — 2026-07-29. Maestro now authenticates local clients, restricts endpoint access, filters child environments, rejects detached mutation and denies narrowly defined catastrophic shell targets. Recode remains explicitly non-sandboxed; stronger containment remains deployment work.

Preserve project trust and extension policy boundaries. Treat enforced containment as separate deployment work.

## P3 — Memory retrieval gap

Keep approved Markdown as source of truth and explicit admission/provenance. Evaluate optional embeddings plus hybrid lexical/semantic ranking only after service lifecycle correctness; do not copy automatic extraction or silent consolidation.

## P4 — Integrated product experience

After lifecycle and release foundations are stable, re-evaluate jcode’s stronger built-in session workspace, background jobs, notifications, side panels, Mermaid and voice features. Classify each as adopt, package, defer or intentionally reject rather than treating broad parity as an automatic goal.

---

# Validation strategy

Use focused tests rather than the unrestricted suite during iteration.

## Startup tests

- timing-group parser regression;
- JSON artifact schema/redaction;
- extension readiness state transitions;
- provider background refresh with cached catalogue;
- Kioku stale-index-open plus asynchronous reconciliation;
- configured and isolated smoke benchmarks.

## Orchestrator tests

- lifecycle state transitions;
- request timeout and pending-map cleanup;
- graceful/forced shutdown bounds;
- stale owner/generation rejection;
- atomic persistence and recovery;
- terminal retention;
- session turn lease and rotation rebind;
- attach conflict and detach survival;
- read-only subscribers;
- waiting-input transition;
- verified restart reconnect and unverifiable orphan refusal;
- completion delivery idempotency;
- workspace boundary enforcement.

After each code phase, run focused tests, `npm run check`, `git diff --check`, and review only task-local changes. Do not run the unrestricted root test suite or build unless separately requested.

# Delivery order and concrete checkpoints

1. S0 measurement repair — complete.
2. S1 representative baseline — complete.
3. S2 release-grade package runtime architecture — complete.
4. S3 lifecycle readiness levels — complete.
5. Checkpoint A configured-package behavior/readiness contract — complete.
6. O0 Maestro characterization and frozen Hermes port mapping — complete.
7. O1 public lifecycle-model port — complete.
8. O2 atomic persistence and terminal retention — complete.
9. O3 deadlines, cancellation and shutdown — complete.
10. O4 durable-session turn leases and rotation-safe rebind — complete.
11. O5 attach, detach, waiting input and verified reconnect — complete.
12. O6 bounded completion queue and idempotent Aizen handoff primitives — complete.
13. O7 workspace safety — complete.
14. O8 service supervision and TUI integration — complete as a component.
15. V1 lifecycle closure — complete: O1 is connected to production execution, O3 includes independent iteration budgets, and production terminal transitions feed O6.
16. Hermes lifecycle conformance against the production authority — complete.
17. Local control-plane security, stable `0.81.5` release identity and Windows/VPS certification — complete.
18. C0–C4 exact-source Recode/jcode/upstream-Pi product checkpoint — complete for prioritization; matched performance evidence remains pending.
19. V2-A operational Recode Doctor checkpoint — freeze scope, then build/install and certify the current read-only human/JSON implementation from the exact artifact.
20. V2-B direct Maestro attach and searchable session/workspace picker — source implementation and focused dashboard coverage are present; installed-artifact/TUI certification remains.
21. V2-C matched startup evidence — active. Clean-source uncontrolled-cache configured/isolated RPC and TUI baselines plus isolated Maestro service-ready, one-session spawn, warm-attach and Windows process-tree resource artifacts are retained under `Analyze/evidence/v2-c-2026-08-02/`. Ten-session measurement currently fails closed at the production eight-live-session bound; repeated/per-process attribution and exact matched jcode/upstream endpoints remain.
22. V2-D measured non-memory O9 — package manifests, immutable provider/model metadata and explicit MCP/Browser service ownership only where V2-C proves material duplication.
23. Stop for Creator review before V2-E memory retrieval/index sharing, then complete remaining distribution work and eventually V3 remote channels.

This order keeps startup and cold-start comparison explicit rather than allowing service readiness to conceal it. Doctor remains read-only and bounded. No automatic-retrieval, embedding/reranking, shared-Kioku-index or durable-memory supersession work begins before the V2-E review.
