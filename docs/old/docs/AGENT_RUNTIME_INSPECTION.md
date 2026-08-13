# RePi Agent Runtime Inspection

Status: architecture checkpoint; naming settled, runtime migration bounded

Date: 2026-07-18

This document records the package comparison, runtime findings, design intent,
external Pi package references, and agreed sequencing before the Aizen runtime
migration. It is evidence and planning, not authorization to implement the
migration.

## Creator's design intent

RePi should be a small, hardened foundation that makes the model do less heavy
mechanical work while preserving room for stronger models and broader capabilities
later.

The governing rules are:

- deterministic code handles anything that does not require model judgment
- the model handles interpretation, reasoning, synthesis, and uncertain decisions
- one strong reusable runtime is preferable to several partial agent loops
- context, tools, permissions, and budgets are bounded before a model turn begins
- new files and abstractions must earn their place through a concrete runtime benefit
- speed comes from less unnecessary context and fewer unnecessary model calls, not
  from weakening correctness or durability
- the core should be minimal, effective, testable, and hardened before expansion

## Package comparison

Current RePi and current upstream Pi have the same five root packages:

| Package | Responsibility | RePi office interpretation |
| --- | --- | --- |
| `packages/agent` | Generic model/tool loop and runtime primitives | Work engine |
| `packages/coding-agent` | CLI application, tools, extensions, session coordination, and modes | Aizen and the office application |
| `packages/tui` | Terminal input and rendering primitives | Office interface |
| `packages/orchestrator` | Experimental supervisor for multiple RPC Pi processes | Later process/building supervisor; not required now |
| `packages/ai` | Provider/model abstraction | Deliberately outside this inspection |

The inspected `agent-loop.ts`, `agent.ts`, `harness/agent-harness.ts`,
`harness/types.ts`, and `harness/session/session.ts` match current upstream after
normalizing only the package namespace from `@reitaard/repi-*` to
`@earendil-works/pi-*`.

RePi's product differentiation is concentrated in `packages/coding-agent`.
The comparison found 54 RePi-only source files covering:

- Aizen/RePi identity and presentation
- Kioku and Shiori memory behavior
- LSP and post-write intelligence
- named-worker identity, tools, conversations, settings, and TUI
- RePi-specific terminal and status presentation

Conclusion: Aizen should remain the RePi coding-agent application. Creating a
separate Aizen package would add structure without a proven benefit.

## Current execution path

Today a normal terminal prompt follows this path:

```text
Creator types "hi"
        |
        v
InteractiveMode
        |
        v
AgentSession
        |
        v
legacy Agent
        |
        v
model and tools
        |
        v
SessionManager persists the transcript
```

`createAgentSession()` currently creates a legacy `Agent`, restores its messages
from `SessionManager`, and then places that agent inside `AgentSession`.

`AgentSession` is therefore not merely stored chat history. It is a large coding
application coordinator that currently owns or composes commands, extensions,
model state, retries, compaction, queues, tools, LSP, bash, persistence events, and
mode-facing behavior.

## Target execution path

The agreed functional target is:

```text
Terminal
   |
   v
Kreis
   |
   v
AgentRuntime
   |
   v
model and tools
```

`Kreis` is the product-language name for the live office flow connecting the
Creator, Aizen, workers, and the runtime. The correct German spelling is `Kreis`,
meaning circle or circuit. It is used alone: not `KreisController`,
`KreisPipeline`, or a new class name.

`AgentRuntime` is the preferred conceptual name for the current generic
`AgentHarness`. It is the reusable engine that can execute Aizen, Levi, Mayuri, or
Shiori with different identities, resources, policies, and tools.

Code should not be renamed before the one-shot migration proves the final boundary.
Conceptual naming may be settled first; code renaming should happen once, after the
responsibilities are concrete.

### Responsibility map

| Owner | Responsibility | Must not become |
| --- | --- | --- |
| Creator | Defines jobs, authority, promotion, and final intent | An inferred model role |
| Kreis | Connects the active UI route, agent identity, runtime, and reporting route | Another model loop or persistence format |
| Aizen | Main coding agent and Manager; reasons, uses tools, delegates, and combines reports | A package parallel to `coding-agent` |
| AgentRuntime | Executes one bounded model/tool loop with resources, policy, queues, cancellation, and ordered persistence | Product identity or TUI coordinator |
| AgentSession | Current compatibility/application coordinator during migration | The permanent name for the whole product flow |
| AgentSessionRuntime | Replaces sessions and rebuilds cwd-bound services safely | A second agent runtime |
| AgentSessionServices | Constructs auth, settings, model registry, and resource loading | Agent policy or UI state |
| SessionManager | Stores and restores transcript/session data | A live agent or Kreis itself |
| Interactive/print/RPC modes | Adapt input and output for their interface | Owners of model/tool lifecycle |
| Mayuri and Levi | Specialist agents with deterministic profiles and no nested delegation | Self-promoting autonomous managers |

The migration must reduce duplicated mechanical work. If an adapter needs a
second implementation of session replacement, tools, compaction, or event
ordering, the missing AgentRuntime primitive should be fixed instead.

## Office model

The mental model is deliberately simple:

```text
Creator
   |
   | assigns a job
   v
Aizen - Manager
   |\
   | +---- research job ----> Mayuri - Specialist
   |
   +------ audit job --------> Levi - Specialist

Workers return reports to Aizen or directly to Creator according to the route.
```

The harness/runtime exists to support this office. The metaphor must not create
extra model loops or speculative class layers.

### Deterministic promotion levels

Promotion is configuration owned by code and the Creator. The model never promotes
itself or silently changes its authority.

A future worker profile can contain:

```text
identity
role
rank
model
thinking level
token budget
tools
permissions
memory scope
reporting target
```

Initial interpretation:

- Creator: human authority
- Aizen: Manager; may route jobs and combine reports
- Mayuri: Specialist; no nested delegation
- Levi: Specialist; no nested delegation
- future promotion: explicit Creator-controlled configuration only

## Why AgentRuntime exists

AgentRuntime does not reduce token use merely by existing. Its benefit is that one
hardened execution boundary can deterministically enforce:

- relevant context selection
- tool visibility and allowlists
- model and thinking selection
- token budgets
- queue and cancellation behavior
- compaction and save points
- provider calls and retries
- session writes and event ordering

This lets the model carry less mechanical load. Stronger future models gain more
room because the surrounding code supplies clean context, reliable tools, and
explicit authority instead of asking the model to manage those concerns itself.

## Pi package research

The package survey favors selective adaptation rather than installing overlapping
agent frameworks.

### Strong adaptation candidates

#### pi-roles

Reference: <https://pi.dev/packages/pi-roles>

Adapt role inheritance; model, thinking, and tool profiles; tri-state tools; and
deterministic project/user precedence. Use these ideas for worker profiles and
promotion levels. Do not add arbitrary mid-session identity swapping to Aizen.

#### pi-permission-system

Reference: <https://pi.dev/packages/pi-permission-system>

Adapt `allow`, `ask`, and `deny`; hide denied tools before the model turn; enforce
the same policy at tool-call time; preserve global safety denials; and support
worker-specific overrides. RePi should eventually own one small internal evaluator.

#### pi-intercom

Reference: <https://pi.dev/packages/pi-intercom>

Adapt later, when workers own sessions: live session registry; `send`, `ask`,
`reply`, and `status`; targeted messages; session-stored incoming messages; and an
explicit waiting/blocked state. Start in-process and add a broker only for separate
processes.

#### pi-docket

Reference: <https://github.com/roodriigoooo/pi-docket>

Adapt evidence outside model context, explicit evidence injection, human-controlled
verdict/report cards, and preservation of failed-worker evidence. Do not take its
tmux worker engine or worktree workflow during the runtime migration.

#### statusline-pi

Reference: <https://pi.dev/packages/statusline-pi>

Adapt only input/output/cache tokens, estimated cost, response speed, and tool-call
count to compare the legacy and AgentRuntime paths.

### Later reference candidates

#### pi-herdr-subagents

Reference: <https://github.com/0xRichardH/pi-herdr-subagents>

Useful later for pane creation by explicit id, no focus stealing, simultaneous
visible sessions, projected status, and standalone/lineage/inherited session modes.
Do not adopt its subagent engine.

#### pi-subagents

Reference: <https://github.com/nicobailon/pi-subagents>

Use as a reference for child cost accounting, watchdog/doctor commands, profile
administration, and supervisor escalation. Do not adopt its delegation engine.

#### pi-hermes-memory

Reference: <https://pi.dev/packages/pi-hermes-memory>

Use later as a reference for policy-only memory, explicit scopes, search-on-demand,
and secret/prompt-injection scanning. Do not install another memory system beside
Kioku.

### Rejected for current architecture

- `context-mode`: useful ideas but a large Elastic-2.0 MCP/context system
- dynamic context pruning: unclear license and model-generated compression may add
  calls
- `pi-btw`: separate RPC model sessions duplicate future worker-session behavior
- dynamic workflow frameworks: too much orchestration before Aizen uses the runtime
- multiple permission plugins: conflicting hooks and no single authority

## Migration sequence

1. Keep `Kreis` in product/concept language without renaming public code.
2. Use the responsibility map above as the migration boundary.
3. Add narrow token/tool-call measurements for parity evidence.
4. Route one print/one-shot Aizen request through AgentRuntime behind a rollback
   boundary.
5. Confirm the new path does not add provider calls or unnecessary context.
6. Add only the missing runtime primitives exposed by the real adapter.
7. Migrate RPC after one-shot parity.
8. Migrate the interactive TUI last.
9. Remove the legacy `AgentSession -> Agent` execution path only after parity.
10. Discuss worker-owned sessions and isolated memory.
11. Add promotion profiles and deterministic permissions.
12. Consider evidence-on-demand reports and minimal Herdr panes.

## First implementation checkpoint

The first shared runtime primitive is now concrete:

- `createHarnessModels()` owns the private bridge from coding-agent's
  `ModelRegistry` to the provider collection required by `AgentHarness`
- Shiori and named workers use this one bridge instead of maintaining two copies
- each isolated runtime receives only its selected model and resolves credentials
  through the existing registry
- the bridge adds no provider call and no model-visible context

The production one-shot Aizen path is not switched yet. Phase 1A and Phase 1B
now adapt the first two boundaries rather than bypassing them:

1. `SessionManager` and the harness `SessionStorage` use different persistence
   contracts; manually appending a harness result would weaken ordered writes.
2. Coding tools, prompt metadata, context files, and extension hooks are assembled
   inside `AgentSession`; the Aizen profile now adapts the loaded resources and
   `before_agent_start` preparation without rediscovering them.
3. Retry and auto-compaction settings remain application-owned, while the
   one-shot adapter applies them through public `AgentHarness.retry()` and
   `AgentHarness.compact()` operations.

`createAizenRuntimeProfile()` snapshots the current model, thinking level,
system prompt, active tools, queue modes, skills, and prompt templates, and exposes
the existing `before_agent_start` preparation as a typed callback. `RecodeSessionStorage` preserves
the harness-generated entry identity, parent chain, active-tool changes, and leaf
journal in the existing RePi JSONL. `createAizenRuntime()` is a non-production
proof that composes those boundaries with Pi's `AgentHarness`, `Session`, and
`NodeExecutionEnv`; a faux-provider turn survives a real session reopen.

Text and JSON print modes now expose the explicit `--aizen` checkpoint. They route
the prepared Aizen profile through Pi's `AgentHarness`, writes replies through
the existing raw-output guard, persists through `RecodeSessionStorage`, and
abort the harness on termination. JSON mode preserves the existing session-header-first
JSONL contract and maps Aizen's lifecycle, retry, compaction, and high-level settlement
events onto the existing public event shapes. The legacy print runtime remains the
default rollback path.

Provider headers now run after provider authentication is assembled. Lifecycle
events reach existing extensions before message persistence, and the Aizen
one-shot adapter applies retry and threshold/overflow compaction without
duplicating the user prompt. RPC output remains outside this checkpoint; it must
reach parity before the Aizen route becomes the default.

The first durability checkpoint is also active. `AgentHarness` appends
model-invisible `recode.agent_harness.journal` custom entries for operation,
turn, and tool start/finish boundaries. Recovery appends interruption records
for unfinished work and does not replay uncertain provider or tool activity.
`getJournalEntries()` exposes the structured history for diagnostics and a
future Inspector agent. Durable steering/follow-up queues and pending-write
acceptance markers remain later durability work.

## Explicitly deferred

- code-level class/package renames
- worker-owned persistent sessions
- worker memory
- permission implementation
- Herdr code or distribution
- RPC, Gateway, scheduler, or channels
- another agent loop or orchestration framework

## Naming decision

- `Kreis` names the live product flow only.
- `AgentRuntime` describes the reusable execution engine conceptually.
- Existing `AgentHarness`, `AgentSession`, and `AgentSessionRuntime` symbols remain
  unchanged until a working migration proves which rename, if any, is useful.
- Saved chat and transcript storage keep plain technical session terminology.
- Aizen is the main coding agent; Kreis is not an agent.

## Home-laptop continuation handoff

Continue on branch `agent-harness`. Read this document first; do not restart the
worker design or rename Pi's public classes.

Validated checkpoint:

- named-worker direct chat, session restoration, settings, identity colors,
  activity shimmer, compact report cards, and typed Creator/Aizen routes are
  implemented
- Mayuri is the public-web research Specialist; Levi is the local code/architecture
  audit Specialist; Aizen remains the main coding agent and Manager
- `Kreis` is product vocabulary only and `AgentRuntime` is the conceptual name for
  `AgentHarness`
- the shared `createHarnessModels()` provider/auth bridge is implemented and tested
- Aizen's opt-in one-shot path preserves loaded skills, prompt templates, and
  `before_agent_start`, context, provider-payload/response, and tool interception
  through the shared harness
- focused worker/runtime tests and `npm run check` pass on the Windows checkpoint
- `pi-web-access` still needs a RePi compatibility alias before Mayuri's real web
  tools can load through the installed extension

Resume Phase 1 with provider-header and lifecycle hook parity, followed by the
existing retry and auto-compaction decisions. Keep the legacy one-shot path as the
rollback until those focused parity tests pass. RPC and interactive migration
remain later phases.
