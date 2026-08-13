# Architecture Sources

This is the living comparison file for RePi. It records what to learn from
other agents without turning their feature lists into requirements.

## Decision rule

RePi keeps Pi's model, loop, tools, sessions, compaction, and TUI foundations.
New capabilities should compose around `AgentHarness`; they must not create a
second agent loop or make the harness depend on a particular UI, gateway,
memory engine, or execution backend.

| Source | Learn from it | RePi decision |
| --- | --- | --- |
| [Pi](https://github.com/earendil-works/pi) | Provider abstraction, loop, tools, JSONL sessions, compaction, TUI, extensions | Keep as the foundation and continue tracking upstream releases. |
| [OpenClaw](https://github.com/openclaw/openclaw) | Always-on gateway, authenticated device/channel protocol, pairing, cron, nodes, health, and main-versus-non-main trust boundaries | Adapt its control-plane ideas after the harness integration. Start with one local authenticated channel. |
| [Claurst](https://github.com/Kuberwastaken/claurst) | Goal mode, background work, subagents, and ACP editor integration | Treat as workflow inspiration. Add only after durable single-agent operation works. |
| [AI Builder Club skills](https://github.com/AI-Builder-Club/skills) | Harness engineering discipline, trigger-based skills, verification, and compounding repository knowledge | Use its verification habits and file-based knowledge patterns, not its repository layout as a dependency. |
| [Claude Code from Source](https://github.com/alejandrobalderas/claude-code-from-source) | Architecture checklist: concurrent-safe tools, compaction layers, lazy skills, memory recall, and cache-sharing forks | Educational reconstruction only. Validate every idea against RePi and focused tests. |
| [Crush configured](https://github.com/reitaard/crush-re.configured) | SQLite memory, lazy session sources, Sourcegraph search, LSP lifecycle, diagnostics, references, hooks, permissions, and named-agent wiring | Port selected designs as TypeScript services and harness adapters. Do not port the Go loop. |
| [oh-my-pi](https://github.com/can1357/oh-my-pi) | Hash-anchored edits, broad LSP/DAP, persistent Python/Bun kernels, typed worktree subagents, tool discovery, ACP/RPC, internal resource schemes, and curated memory | Borrow narrow primitives after the core is durable. Do not chase feature parity. |

## Crush findings

The local checkout at `C:\Users\admin\Desktop\re\crush-re.configured` was
inspected directly. It contains three designs RePi should preserve.

### Memory

- SQLite `memory.db` is authoritative; Markdown and `MEMORY.md` are transparent
  projections that can reconcile back into the database.
- Recall and recording are separate from chat history, summarization, and
  compaction.
- Records have global or canonical-Git-project scope, provenance, confidence,
  status, replacement links, pinning, recall telemetry, and explicit review.
- Recording happens after a completed idle turn through a bounded, no-tools
  model call. Recall selects a bounded set before a normal turn.
- Secret filtering and derivability checks occur at the storage boundary.
- WAL mode, busy timeout, verified backup, repair, maintenance, and lexical
  fallback make the subsystem useful when the selector model fails.

RePi should adapt this as a `MemoryService` outside `AgentHarness`. The harness
receives recalled memory as a typed turn resource and emits completed-turn
events for asynchronous recording. Session JSONL remains conversation history;
SQLite becomes durable cross-session knowledge.

### Sources

- A session can retain file, URL, or text references without injecting their
  bodies into every prompt.
- Sources are listed cheaply and resolved only when the model needs them.
- PDFs and images can become native model file parts after explicit activation.
- Source content remains separate from ordinary session messages, which avoids
  unnecessary context growth.

RePi should add a generic `SourceService` and expose sources as harness
resources. Retrieval, size limits, MIME handling, provenance, and trust labels
belong in the service rather than the loop.

### LSP and code search

- Language servers are discovered from defaults plus user configuration and
  start lazily for matching files and project root markers.
- Missing servers have a retry cooldown; ambiguous generic executables are not
  auto-started accidentally.
- Diagnostics are cached and published as events. Agent tools expose diagnostics,
  references, and restart operations.
- Sourcegraph provides remote code search independently from local grep.

RePi should begin with one `CodeIntelligenceService` offering diagnostics,
references, definitions, symbols, and rename. It should subscribe to successful
file mutations and remain optional when no server is installed.

## oh-my-pi comparison

### Adopt early

- Content/hash-anchored edits with stale-file rejection or recovery.
- LSP validation after writes, with diagnostics surfaced to the agent.
- Hidden-tool indexing so a small active tool set can discover a specialized
  tool without loading every schema into every request.
- A consistent resource interface for files, URLs, SQLite, archives, PDFs, and
  internal objects, while retaining typed implementations underneath.
- Windows-native path and process behavior as a tested first-class target.

### Adapt after durable single-agent operation

- Persistent Python and JavaScript execution sessions with tool re-entry.
- Typed subagent results, recursion limits, budgets, cancellation, and isolated
  worktrees.
- ACP and RPC as alternate transports over the same assistant service.
- Retain/recall/reflect operations on top of the memory store.
- Preview-and-resolve mutations for high-risk or broad edits.

### Defer

- DAP debugger orchestration.
- Browser/Electron control, collaboration relay, and internal URL breadth.
- Advisor model on every turn.
- Automatic multi-commit splitting.
- Native Rust rewrites of search, shell, AST, and image tooling until profiling
  proves JavaScript subprocess overhead is a real bottleneck.

## Current RePi gap summary

RePi already has the strongest piece to build around: the extracted
`AgentHarness`, its session repositories, compaction primitives, execution
environment, and existing Pi coding tools. The main missing layers are:

1. Migration of the coding-agent application onto `AgentHarness`.
2. Durable harness recovery and automatic compaction/retry semantics.
3. An authenticated always-on assistant gateway and job state store.
4. Promotion of the working coding-agent memory and LSP implementations into
   reusable services during harness migration; lazy sources are still missing.
5. Scheduling, goal continuation, channels, and later multi-agent isolation.

The Windows harness failures found during the first audit are a small foundation
compatibility task, not an architectural blocker.

Memory and LSP are working implementations, not missing features. Their final
assistant-owned service boundary is migration debt rather than architectural
damage. Keep their current modules stable and follow
[AgentHarness Migration](AGENTHARNESS.md) before extracting interfaces or
creating `packages/assistant`.
