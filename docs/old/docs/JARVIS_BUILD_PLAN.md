# RePi Personal Assistant Build Plan

This is the living build order for turning the Pi fork into an always-available
personal assistant. Update checkpoints here as implementation progresses.

For the migration handoff, current ownership map, and strict stop/go gates, read
[AgentHarness Migration](AGENTHARNESS.md) before changing the coding loop or
extracting new service interfaces.

## Current decisions

- Recode is a personal, single-user, local-first assistant.
- The main agent may have full host authority initially.
- Authentication is still required before any remote or channel exposure.
- Sandboxing is deferred until named agents, untrusted channels, or delegated
  roles exist. Later, the main personal session can remain host-authoritative
  while non-main agents use restricted execution backends.
- `AgentHarness` owns the loop-facing lifecycle. Gateway, memory, scheduler,
  channels, and UI are host services around it.
- Build one dependable path end to end before adding multiple channels, voice,
  or a swarm.

## Phase 0: Stabilize the portable development foundation

Status: complete

- Fix path-separator assumptions at the execution-environment boundary and in
  harness tests.
- Make symlink-dependent tests capability-aware when the process cannot create
  symbolic links.
- Normalize shell working-directory paths without depending on one shell's
  display format.
- Keep local binary builds and the `recode` launcher reproducible.

Exit criteria:

- The focused harness suite passes on development checkouts, except for clearly
  documented platform capability skips.
- `recode --version`, `recode --help`, one-shot mode, and interactive startup work
  outside the repository.

## Phase 1: Put the coding agent on AgentHarness

Status: default-on checkpoint; responsibility map, shared model/auth bridge,
ordered JSONL storage, text/JSON/RPC/interactive lifecycle, retry, compaction,
settlement parity, and the first structured operation/turn/tool recovery journal
are complete. The legacy runtime remains only as a temporary rollback path.

1. Map current `AgentSession` responsibilities to harness, application service,
   or TUI responsibility.
2. Add a narrow adapter for the existing coding tools and resource loader.
3. Run one-shot/RPC mode through `AgentHarness` first because it has less UI
   coupling.
4. Migrate interactive mode after event and queue parity is proven.
5. Remove the older duplicated lifecycle only after parity tests pass and after
   asking before intentional functionality removal.

Required harness work:

- Finish lifecycle, settlement, abort, hook reentrancy, and save-point tests.
- Add automatic compaction decision points and retry policy.
- Define model registry and typed hook/context facades.
- Extend the structured operation/turn/tool journal with durable queue and
  pending-write acceptance records described in
  `packages/agent/docs/durable-harness.md`.

Exit criteria:

- One loop implementation serves one-shot, RPC, and interactive modes.
- Existing coding-agent behavior has focused parity tests.
- Restart recovery marks uncertain provider/tool work interrupted and never
  silently repeats a non-idempotent tool.

## Phase 2: Create the assistant service

Status: planned

Add `packages/assistant` as the composition root for:

- `AgentHarness`
- model/auth registry
- execution environment and tool registry
- JSONL session repository
- SQLite runtime state
- memory, source, and code-intelligence services
- scheduler and gateway adapters

Do not put a second model/tool loop in this package.

The first gateway should be local and authenticated, using validated protocol
messages with protocol version, client ID, request/run ID, timestamps, and
idempotency keys for side-effecting commands. It needs health, cancellation,
timeouts, reconnect handling, and bounded event replay.

Use SQLite for assistant state that is not conversation history:

- runs and jobs
- schedules
- idempotency records
- channel/device identities
- memory metadata and retrieval telemetry
- recovery checkpoints

Install the gateway through a reliable Windows startup mechanism only after
foreground start/stop/recovery behavior is tested.

Exit criteria:

- A local client can authenticate, start a run, stream events, cancel it,
  reconnect, and retrieve the final state.
- Restarting the service does not lose accepted jobs or duplicate completed
  side effects.

## Phase 3: Add memory, sources, and LSP

Status: coding-agent memory and LSP prototypes implemented; assistant-service extraction planned

The working implementations intentionally precede the final service boundary:

- Memory is a built-in coding-agent extension backed by dedicated Markdown,
  chunking, and SQLite FTS modules.
- LSP is implemented in dedicated modules and composed into coding-agent tools
  by `AgentSession`.
- Neither implementation should move yet. Define `MemoryService` and
  `CodeIntelligenceService` only while migrating the first real execution path
  to `AgentHarness`, so their interfaces follow proven harness requirements.
- Lazy sources remain unimplemented.

### Memory v1

- Adapt Crush's SQLite-authoritative, projection-readable architecture.
- Keep recall and recording independently configurable.
- Store provenance, scope, confidence, status, replacement, pinning, and usage.
- Use bounded pre-turn recall with lexical fallback.
- Use bounded post-turn extraction with no tools and explicit pending review.
- Reject likely secrets and workspace-derivable facts at the storage boundary.
- Back up before migrations or destructive maintenance.

### Sources v1

- Persist file, URL, and text references per session or project.
- Inject metadata cheaply and resolve content lazily.
- Attach supported PDF/image content only after explicit resolution.
- Record source provenance and external-context trust.

### LSP v1

- Discover configured servers and start lazily by file type/root markers.
- Expose diagnostics, references, definitions, symbols, rename, and restart.
- Refresh diagnostics after successful writes without blocking unrelated turns.
- Treat LSP absence as a capability gap, not an agent failure.

Exit criteria:

- A new session recalls a verified project preference without copying old chat
  history into the prompt.
- The agent can attach and later resolve a source without permanent context cost.
- A write can surface fresh language-server diagnostics to the next agent step.

## Phase 4: Make it continuously useful

Status: planned

- Add a persistent scheduler and background-job state machine.
- Add goal continuation with explicit token/time/action budgets and stopping
  conditions.
- Add one channel only, initially a local web or desktop client.
- Add notifications and daily/periodic tasks after job recovery is reliable.
- Add logs, traces, replayable protocol fixtures, and failure-injection tests.

Exit criteria:

- A scheduled task survives process restart and reports a truthful final state.
- A bounded goal can pause, continue, complete, or fail without an infinite loop.
- The assistant remains observable and controllable when a provider or tool hangs.

## Phase 5: Delegation and trust boundaries

Status: named read-only worker harness implemented early; remote trust and durable
delegation remain deferred until Phases 1-4 are reliable

- Define named roles, skills, allowed tools, workspace scope, budgets, and output
  schemas.
- Run non-main agents in restricted worktrees or sandbox backends.
- Require typed results and stable run IDs from subagents.
- Add recursion/depth limits, cancellation propagation, and cost accounting.
- Keep the main personal session host-authoritative unless the threat model
  changes.

The current optional Mayuri/Levi checkpoint is deliberately narrower than this
phase: local read-only tools, isolated child `AgentHarness` turns, in-memory
conversations, no nesting, and no untrusted channel exposure. Stabilize and use it
without expanding into the future Gateway/delegation architecture.

## Phase 6: Advanced surfaces

Status: deferred

- Voice input/output and wake word.
- Mobile/device nodes.
- Canvas and browser automation.
- ACP/editor integration.
- Persistent Python/JavaScript kernels.
- DAP debugger integration.
- Multi-channel routing and collaborative sessions.

## Publishing and package namespace

Forking does not require one repository per package. These packages can remain
in this monorepo. The publishable workspaces now use the controlled RePi names:

- `@reitaard/repi-ai`
- `@reitaard/repi-agent-core`
- `@reitaard/repi-tui`
- `@reitaard/repi-coding-agent`
- `@reitaard/repi-orchestrator`

Internal imports, generated install metadata, release scripts, and repository
metadata must keep using these names. The application can still be the only
publicly promoted package if the lower-level packages are intended mainly as
implementation details.

Keep the upstream license, changelog history, issue links, and attribution.

## Near-term checkpoint

- [x] Fix portable harness compatibility tests and capability-gate symlinks.
- [x] Write the AgentSession-to-AgentHarness responsibility map.
- [x] Consolidate the private ModelRegistry-to-AgentHarness provider/auth bridge.
- [x] Prove a one-shot AgentHarness coding run with existing tools.
- [x] Stabilize working coding-agent memory and LSP implementations without premature service extraction.
- [x] Record the AgentHarness migration hold, parity gates, and ownership map in `docs/AGENTHARNESS.md`.
- [ ] Design SQLite schemas only after the service and event boundaries are set.
- [x] Select Telegram as the first authenticated channel and prove the narrow
  Recode Gateway-to-Aizen RPC path.
- [x] Move publishable workspaces to the `@reitaard/repi-*` namespace.
- [x] Prove isolated named workers and reusable in-memory worker conversations.
- [x] Verify direct named-worker start/continue behavior through the source CLI.
- [x] Add the `/worker` TUI roster/settings/direct-chat page without exposing
  technical ids by default.
- [x] Add searchable persisted worker model/thinking/token settings, session-only
  direct-chat continuity, and identity-colored worker activity/report presentation.

See [Architecture Sources](ARCHITECTURE_SOURCES.md) for the comparison that
drives these priorities.
