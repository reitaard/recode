# AgentHarness Migration

This is the short, durable handoff for future agents working on RePi's
`AgentSession` to `AgentHarness` migration. Read it together with
[RePi Personal Assistant Build Plan](JARVIS_BUILD_PLAN.md),
[Architecture Sources](ARCHITECTURE_SOURCES.md), and the detailed
[AgentHarness lifecycle](../packages/agent/docs/agent-harness.md).

The settled `Kreis` vocabulary, completed responsibility map, first shared runtime
primitive, and home-laptop continuation point are recorded in
[Agent Runtime Inspection](AGENT_RUNTIME_INSPECTION.md).

## Decision

Hold the migration until the first real execution path is selected and parity
can be measured. Keep the current memory and LSP structures. Do not create
`MemoryService`, `CodeIntelligenceService`, or `packages/assistant` merely to
match the future diagram.

The working implementation precedes the final service boundary while remaining
compatible with it. This is architectural migration debt, not architectural
damage.

## Current ownership

### Coding path

- `packages/coding-agent/src/core/agent-session.ts` owns the current application
  session lifecycle and composes tools, extensions, model state, compaction,
  queues, and LSP wiring.
- `packages/coding-agent/src/core/agent-session-services.ts` creates cwd-bound
  auth, settings, model-registry, and resource-loader infrastructure.
- `packages/coding-agent/src/core/agent-session-runtime.ts` owns session
  replacement and recreates cwd-bound services across new, resume, fork, import,
  and shutdown flows.
- `AgentSession` remains the coding-agent adapter, while one-shot, RPC, and
  interactive turns now route through Aizen Runtime and `AgentHarness` by
  default. A settings toggle and `--legacy` preserve a short-lived
  rollback path.

### AgentHarness

- `packages/agent/src/harness/agent-harness.ts` is the intended loop-facing
  orchestration primitive.
- It already owns turn snapshots, operation phases, queue draining, abort,
  session persistence, pending-write ordering, save points, compaction, tree
  navigation, tools/resources, provider streaming, and typed failures.
- Aizen Runtime now supplies the coding-agent lifecycle, retry, compaction,
  settlement, and structured recovery-journal boundary.
- Removing the legacy duplicated lifecycle remains gated on one release of
  default-on runtime use and focused regression evidence.

### Memory

- `packages/coding-agent/src/recode-memory.ts` is a built-in extension and UI/tool
  adapter.
- `packages/coding-agent/src/core/recode-memory/` owns Markdown discovery,
  chunking, SQLite FTS indexing, search, and bounded reads/writes.
- Project memory is trusted-project-only by default.
- Explicit global access and global auto-recall are independent opt-in controls.
- The implementation is sufficiently isolated for later adaptation; do not move
  it into `AgentSession` or invent a service facade before a harness consumer
  exists.
- `Shiori (栞)` is the first narrow memory-harness consumer: `/shiori` reviews
  bounded session chunks through an isolated, tool-free `AgentHarness` call.
  Cardinal routing, checkpoint persistence, Markdown writes, deduplication, and
  Kioku indexing remain deterministic coding-agent responsibilities.
- This proves isolated model/auth reuse but does not migrate the production
  coding loop. Do not generalize Shiori's narrow bridge into the future
  `MemoryService` contract before the one-shot/RPC coding-path adapter exists.

### LSP

- `packages/coding-agent/src/lsp/` owns configuration, discovery, protocol
  clients, lifecycle, diagnostics, workspace edits, and writethrough behavior.
- `AgentSession` currently composes LSP into edit/write and the LSP tool.
- `AgentSessionRuntime` stops cwd-bound LSP lifecycle state during replacement.
- Servers activate lazily. LSP absence or post-write diagnostic failure must not
  turn a successful file mutation into an agent failure.
- The modules can later back a `CodeIntelligenceService`; do not wrap them until
  the harness/application contract is concrete.

## Why extraction is on hold

The final service owner does not exist: `packages/assistant` has not been
created, and coding-agent does not use `AgentHarness`. Extracting interfaces now
would guess at lifecycle, trust, cancellation, event, resource, and persistence
requirements. Those guesses would likely be rewritten during the real
migration.

Folder structure alone is not the goal. The future difference is ownership:

- Today, coding-agent owns memory activation and LSP composition.
- Later, an assistant composition root will own reusable memory and
  code-intelligence capabilities and provide typed turn resources/hooks to
  `AgentHarness`, independent of TUI details.

## First migration path

Migrate one-shot or RPC mode first. It has less TUI coupling and gives a narrow
parity surface.

1. Write an explicit responsibility map for `AgentSession`,
   `AgentSessionServices`, `AgentSessionRuntime`, modes, extensions, and TUI.
2. Build a narrow coding-tool/resource adapter for `AgentHarness` without moving
   memory or LSP.
3. Run one one-shot/RPC request through `AgentHarness` with the existing model,
   auth, tools, system prompt, resources, session persistence, and output events.
4. Add parity tests before redirecting the production path.
5. During this real integration, identify the smallest host-facing memory and
   code-intelligence contracts demanded by turn preparation, successful file
   mutation, session replacement, and shutdown.
6. Extract those contracts from the proven adapter, not from a speculative
   architecture diagram.
7. Migrate interactive mode only after one-shot/RPC parity and lifecycle safety
   are established.
8. Remove the old lifecycle only after all modes have parity and intentional
   removals are reviewed explicitly.

## Contract discovery questions

Answer these from the first working adapter before creating service interfaces:

- Which memory data is a turn resource, which is an on-demand tool result, and
  which events may record memory asynchronously?
- How are project trust, explicit global access, and global auto-recall passed
  without coupling the harness to coding-agent settings or UI?
- Which LSP operations are tools, which are post-mutation observers, and which
  diagnostics belong to the next turn snapshot?
- Who owns cwd changes, lifecycle shutdown, cancellation, retry cooldowns, and
  background watchers?
- Which service state is durable, which is rebuildable, and which belongs only
  to the active host process?
- How do extension hooks map to harness hooks without exposing raw session writes
  or weakening deterministic save-point ordering?

## Parity gates

Do not switch a production execution path until focused tests prove:

- model selection, auth, thinking levels, stream options, and session IDs match
- system prompts, context files, skills, prompts, extensions, and active tools
  match
- steering, follow-up, queued messages, abort, compaction, and tree navigation
  preserve current behavior
- tool events and transcript persistence remain deterministically ordered
- edits/writes preserve post-mutation success semantics and surface LSP
  diagnostics without blocking
- project trust and memory global-access boundaries remain unchanged
- session new/resume/fork/import and cwd-bound teardown remain correct
- one-shot/RPC output and exit behavior remain compatible
- Windows paths, process behavior, and launcher flows pass focused checks

## Stop conditions

Pause the migration rather than adding workarounds if:

- a needed hook or session facade does not exist in `AgentHarness`
- an adapter must reach into harness private state
- the same lifecycle is being implemented a second time
- tool/session ordering becomes fire-and-forget or nondeterministic
- provider or tool work would be silently retried after an uncertain crash
- memory/LSP must depend on TUI-only objects to serve the harness path

Fix the missing harness primitive first, prove it with focused tests, and then
continue the adapter.

## OpenClaw boundary

OpenClaw remains the inspiration for the later control plane: authenticated
gateway, pairing, channels, scheduling, health, nodes, and explicit trust
boundaries. Do not copy its agent loop or start gateway work before the
AgentHarness coding path is proven. Adapt OpenClaw control-plane ideas around the
single RePi harness and assistant composition root after migration.

## Deferred work

- `packages/assistant` composition root
- `MemoryService`, `CodeIntelligenceService`, and `SourceService`
- authenticated gateway and durable job store
- scheduler, background goals, channels, and delegation
- dirty-file memory indexing optimization unless profiling proves it necessary

These are deliberately deferred, not forgotten.
