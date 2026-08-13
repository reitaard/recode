# RePi Agent Orchestration Plan

Status: local worker harness and Aizen runtime migration checkpoints are complete.
Telegram is the first narrow Recode Gateway adapter; durable multi-channel control
plane work remains later.

## Target shape

```text
You / Telegram / Web / another Aizen / programmatic host
                        |
                        v
              Recode Gateway + WorkerDirectory
                        |
                        v
              Aizen (main intelligent agent)
                        |
                        v
          AgentHarness (generic runtime; unchanged)
                        |
             +----------+----------+
             |                     |
       Shiori / Kioku       Named worker conversations
                                  |
                        Mayuri / research
                        Levi / audit
```

OpenClaw remains a control-plane reference for the future Gateway: authentication,
channel routing, session separation, health, cancellation, and typed events. RePi
keeps Pi's runtime and agent loop rather than copying OpenClaw's agent loop or its
full channel/plugin stack.

The current Telegram checkpoint implements one authenticated adapter, per-chat
session routing, sequential delivery, cancellation, and streamed replies through
Aizen RPC. It is the first vertical slice, not the final durable multi-channel
control plane.

Pi delegation packages remain references for fresh child context, named specialists,
tool allowlists, bounded results, cancellation, parallel calls, and blocking
recursive delegation.

## Implemented worker harness phase

### Shared source of truth

`WorkerDirectory` owns:

- canonical worker ids and display names
- roles, personalities, skills, and tool allowlists
- case-insensitive id/name resolution
- active and recent worker conversations
- run ids, statuses, elapsed time, last tool, result, and cancellation handles
- bounded caller/worker dialogue history

It is not tied to one Aizen implementation. It is exported publicly as:

```ts
import { WorkerDirectory } from "@reitaard/repi-coding-agent/workers";
```

Any Aizen, future Gateway, test host, or other programmatic caller can mount the
same directory and worker tools.

### Worker tools

- `delegate`: one-shot bounded worker task
- `worker_list`: identities, roles, personalities, skills, and tools
- `worker_start`: open a conversation and send its first message
- `worker_message`: continue the same named conversation
- `worker_status`: inspect active/recent process state
- `worker_cancel`: cancel the current turn without deleting the conversation
- `worker_close`: cancel if needed and forget the conversation

Independent `delegate` and `worker_start` calls remain parallel-safe. The model
provider may queue them according to its own concurrency limit.

### Conversation behavior

Workers act as stable named personalities. A conversation keeps its worker identity
and bounded caller/worker dialogue, allowing later messages such as:

```text
Start Mayuri and research the extension loader.
Ask Mayuri to narrow the result to Windows.
Ask Levi to audit Mayuri's proposed boundary.
```

Each turn still runs through an isolated child `AgentHarness`. RePi carries forward
only bounded user messages and final worker answers. Hidden reasoning and child tool
transcripts never enter the shared directory.

### Orchestration actors

Creator and Aizen are explicit typed actors rather than display-only labels:

- `creator`: `Creator`, human, role `creator`
- `aizen`: `Aizen (藍染)`, agent, role `primary-agent`

Every worker conversation stores its initiating actor. Direct `/levi` and `/mayuri`
turns carry Creator identity into the harness from the first turn; Aizen tools and
one-shot delegation carry Aizen identity. Bounded transcripts use the actor's real
name and never fall back to the generic label `Caller`.

### Current guarantees

- `AgentHarness` remains the generic engine and is not renamed.
- Aizen is the parent identity, not the runtime class.
- Children use read-only, workspace-guarded tools.
- No nested delegation.
- Child output and carried dialogue are bounded.
- Parent/user cancellation propagates.
- There is **no built-in worker timeout**. A host may explicitly configure one.
- An explicitly requested worker is never silently replaced by Aizen doing the task
  itself unless the user requested fallback.
- Workers do not write Kioku directly.

## Stabilization still required

1. Add Pi package compatibility aliases so third-party extensions can resolve
   upstream Pi package names against RePi's renamed packages. The live CLI check
   confirmed that `pi-web-access` currently fails on `@earendil-works/pi-ai/compat`.
2. Consider editable worker settings only after the read-only settings view and
   direct-chat lifecycle have been exercised manually.
3. Consider durable conversation storage only after the in-memory lifecycle is stable.

Runtime teardown now cancels and forgets the owning directory's active
conversations. Named-worker results also separate local harness setup time from
total provider-backed duration. A 100-run faux-provider benchmark measured local
setup at 0.020 ms median and 0.061 ms p95 on the 2026-07-18 Windows checkout;
this is diagnostic evidence, not a cross-machine performance guarantee.

The same checkpoint passed 32 focused tests and a real source-CLI Levi flow with
extensions disabled: `worker_list`, `worker_start`, then `worker_message` reused
one full conversation id and returned `ready.` followed by `handoff complete.`
The TUI now has a `/worker` roster/settings/direct-chat page, internal conversation
ids, generic searchable aliases including Kanji, personality-aware activity text,
and separate handoff metadata/report rendering. A second source-CLI check resolved
Levi through `監査` and returned the requested `checkpoint ready.` report.
`/levi <message>` and `/mayuri <message>` are native direct-chat shortcuts; slash
autocomplete preserves their `<message>` hint and completes the trailing space.

## Worker presentation polish (implementation complete; manual checkpoint pending)

This is one bounded TUI phase after the correctness checkpoint. It must remain a
typed presentation layer over the existing worker results and must not add an LLM
call, another agent pass, durable worker memory, or a second orchestration path.

### Distinguish direct chat from delegation — complete

- `/levi` and `/mayuri` results use `Name (alias) · direct chat`. They must not say
  they are preparing or presenting a handoff to Aizen.
- Aizen-owned `delegate`, `worker_start`, and `worker_message` calls may use
  `Name (alias) → Aizen (藍染) · handoff`.
- Carry an explicit typed presentation mode (`direct` or `delegated`) instead of
  inferring the route from rendered text.

### Deterministic activity language — complete

Replace the single repeated “preparing a handoff” sentence with small coded phrase
pools selected deterministically from worker id, presentation mode, and turn number.
No model call is allowed. Phrases must stay vague enough to fit arbitrary tasks and
must not claim hidden reasoning.

Examples:

- Levi: `checking the boundary…`, `reviewing the evidence…`, `tightening the report…`
- Mayuri: `following the trail…`, `cross-checking the sources…`, `organizing the findings…`
- Neutral direct-chat fallback: `working through your request…`
- Delegated fallback: `preparing a brief for Aizen (藍染)…`

### Stable spinner lifecycle — complete

- Remove the pending widget before appending/rendering the completed entry so the
  spinner and final card never appear together.
- Cover success, failure, cancellation, rapid completion, and session shutdown.
- The completed card must be stable on its first rendered frame rather than fixing
  itself after a later TUI refresh.

### Compact width-aware tool card — complete

- Use a worker-colored left rail as the primary identity marker.
- Put identity and route at the left edge; right-align status and elapsed time at the
  terminal's right edge, similar to the main agent timer.
- Keep setup time, turns, and tool state on a compact muted metadata row.
- Render generated report text in its own body region with no inherited status color.
- Hide conversation/run ids in the normal card; expose them only in expanded/debug
  details.
- Use distinct, theme-safe colors for Mayuri, Levi, status, timing, and report text;
  validate both light and dark themes and narrow terminals.

The live implementation assigns Mayuri a research-green identity, Levi an
audit-blue/violet identity, and Creator a teal italic `Creator: "message"` line. Pending work uses a
Shiori-style star shimmer with animated dots. Completed reports use a lighter tint
of the worker identity inside a width-aware card with left/right rails.

### Searchable worker settings — complete

- `/worker` opens one bounded, searchable settings surface even while Aizen is
  generating; it does not use nested selectors.
- Enter/Space operate real rows for direct chat, close, status, model, thinking,
  token budget, tools, and prompt/personality.
- Model, thinking, and token overrides persist in `recode-workers.json` under the
  active agent directory. Direct conversations remain session-only.
- `/levi ` and `/mayuri ` keep the `<message>` completion visible after the trailing
  space.

### Replay and fallback audit — complete

The supplied screenshot shows a path that renders raw `conversationId`, run header,
and mostly white result text despite the typed worker presentation. Determine whether
this is an older session, restored tool details losing their type shape, or a live
renderer fallback. Validate both fresh tool calls and restored session history; do
not parse the raw text to repair the card.

The typed self-rendering path now survives a JSON round trip, hides technical ids,
and stays within both narrow and wide terminal widths. Older entries without an
explicit presentation mode retain the safe direct-chat fallback.

Acceptance gate:

1. Fresh `/levi` and `/mayuri` direct chats never mention Aizen.
2. Delegated worker calls identify the Aizen handoff without showing UUIDs normally.
3. Pending and completed states never render simultaneously.
4. Mayuri and Levi remain visibly distinct in fresh and restored sessions.
5. Tool cards remain compact at narrow and wide terminal widths.
6. Focused renderer/lifecycle tests and `npm run check` pass before manual testing.

## Next major phases

### Phase 2: Real Aizen one-shot/print AgentHarness path

- Create Aizen directly on `AgentHarness` for one-shot/print mode.
- Reuse the current model registry, resource loader, tools, session storage, Kioku
  integration, and shared `WorkerDirectory`.
- Keep the existing path temporarily as a rollback boundary.
- Do not rename or fork `AgentHarness`.

### Phase 3: RPC migration

- Move RPC onto the same Aizen harness path.
- Preserve typed events, cancellation, model switching, resource reload, cwd behavior,
  and shared worker access.
- Avoid a separate RPC-only agent loop.

### Phase 4: Interactive migration

- Migrate the TUI last because it is the largest and most coupled surface.
- Preserve editing, autocomplete, rendering, themes, status, extension events, tool
  display, cancellation, and session operations.
- Remove the temporary `AgentSession` bridge after parity is proven.

### Phase 5: Deterministic Gateway

Add one long-running ordinary server process for:

- authentication and device pairing
- Telegram/web/other channel adapters
- routing messages to isolated Aizen sessions
- exposing the shared worker directory to authorized callers
- health, cancellation, and status
- typed request/response and lifecycle events
- keeping credentials outside model prompts

The Gateway performs no AI reasoning. It routes work to Aizen or directly to an
authorized named worker harness.

### Later references, not current requirements

- background worker turns and queued messages
- durable worker conversations across process restarts
- worker-to-Aizen blocked/decision messages inspired by `pi-intercom`
- allow/ask/deny policies inspired by `pi-agent-permissions`
- stronger central filesystem and command boundaries inspired by `pi-file-permissions`
- chains, worktrees, and richer supervision only after the lightweight path is stable

## Non-negotiable identities

- Aizen: main intelligent agent
- AgentHarness: generic runtime engine
- Shiori: existing memory-review specialist
- Cardinal: current memory-routing behavior/configuration
- Kioku: durable memory
- Mayuri: `research` worker
- Levi: `audit` worker
