# Recode audit

## Scope and provenance

- Audited checkout: `agent-harness`, updated through the Recode `0.81.6` V2-C optimization checkpoint on 2026-08-02.
- Upstream inspected: `earendil-works/pi` `upstream/main` at `c820aa26` (fetched 2026-07-28).
- This checkout diverged from upstream at `1f9e846c`; it contains 142 commits beyond that merge base. The delta is 577 files, 32,831 insertions, and 3,781 deletions. This is not a claim that every changed line is custom product logic; it is the verified repository delta.
- No jcode comparison is included in this document.

## Product assessment

Recode is a capable, Pi-derived interactive coding agent. Its core is strong: terminal UI, session persistence/tree/fork/compaction, many providers, filesystem and shell tools, JSON/RPC/SDK modes, and a mature extension/skill/theme/package model. `packages/coding-agent` has 214 test files.

The main product risks are configured extension/package startup latency, high per-session process working sets, distribution polish, documentation identity drift, and a host-privilege security boundary. Maestro is no longer an unfinished experiment: it has bounded lifecycle control, persistence/recovery, authenticated IPC, workspace admission, turn leases, service supervision, diagnostics, direct attach/search, completion delivery, and tested ten-session admission.

### Measured startup observation

The retained installed Recode `0.81.6` Windows x64 compiled baseline uses one warmup plus five measured runs per endpoint with offline mode, no provider request and uncontrolled caches:

- configured TUI input echo: **4,035.8 ms** median
- configured RPC `get_state`: **3,889.8 ms** median
- isolated TUI input echo: **778.3 ms** median
- isolated RPC `get_state`: **891.0 ms** median

Standalone minification reduced isolated RPC readiness to **729.0 ms**, while configured RPC remained **3,876.3 ms** and therefore within run variance. Configured extensions/packages, rather than the isolated core, are now the dominant measured startup cost. These are retained reproducible artifacts, but remain uncontrolled-cache observations rather than destructive cold-cache claims.

## Additions over the Pi merge base

### Product identity and distribution

- RePi product metadata establishes `RePi`, the `recode` app name, and `@reitaard/repi-coding-agent` package identity (`repi/product.json`; `packages/coding-agent/package.json`).
- Custom local packing and release paths were added for Recode, including binary and Termux packaging support (`scripts/recode/pack-custom-local.mjs`, `scripts/build-binaries.sh`, `scripts/build-termux-release.sh`, `scripts/recode-termux`).
- The updater was hardened around source-checkout preservation and fail-closed update behavior; project operational guidance requires clean, fast-forward-only source updates and prevents replacing Recode with upstream Pi (`OPERATIONS.md`, `packages/coding-agent/src/recode/update/`).

### Named workers and delegation

- Added first-class named worker conversations and delegation tooling (`packages/coding-agent/src/core/delegation/`, `packages/coding-agent/src/core/workers/`, `packages/coding-agent/src/recode-workers.ts`).
- Workers are modal private chats within the root Aizen session rather than replacement root sessions. Delegation is enabled by default with `REPI_DELEGATION=0` as opt-out (`OPERATIONS.md`).
- Current named worker roles include audit, research, and private knowledge-oriented handoff behavior.

### Durable project memory

- Added Kioku/Recode memory runtime, chunking, SQLite storage, routing, and explicit teach controls (`packages/coding-agent/src/core/recode-memory/`, `packages/coding-agent/src/core/recode-teach/`, `packages/coding-agent/src/recode-memory.ts`).
- Project Kioku is deliberately scoped to the launch checkout; workers have read-only recall and cannot write durable memory (`OPERATIONS.md`).

### Code intelligence and tool surface

- Added an LSP client, lifecycle, diagnostics, navigation, edits, formatting, code actions, references, symbol search, and rename integration (`packages/coding-agent/src/lsp/`).
- Added Recode package-management tooling (`packages/coding-agent/src/core/tools/package-manage.ts`).

### Provider and integration work

- Added an optional local OpenAI OAuth proxy provider with bounded startup model discovery and manual refresh (`packages/coding-agent/src/recode-openai-oauth.ts`).
- Added Telegram gateway integration and an OpenAI-compatible provider entry point (`packages/coding-agent/src/recode-telegram-gateway.ts`, `packages/coding-agent/src/recode-open-provider.ts`).
- The AI layer also has substantial provider/model catalog changes relative to the merge base (`packages/ai/src/providers/`).

### Multi-session lifecycle

- `@reitaard/repi-orchestrator` now provides the Recode Maestro service, authenticated control plane, searchable dashboard, direct attach, bounded RPC children, durable lifecycle/completion state, workspace safety and native supervision (`packages/orchestrator/`).
- The corrected compiled `0.81.6` artifact reached authenticated service readiness in **930.8 ms**, warm direct control in **1.0 ms**, one configured read-only session in **4,335.6 ms**, and admitted ten sessions.
- A same-sample Windows attribution repeat measured **5,037,240,320 bytes** aggregate working set, including **4,480,823,296 bytes (89.0%) private working set**. Configured standalone RPC processes averaged **485.7 MB** private working set versus **129.1 MB** for isolated-agent-dir processes. Shared executable mappings are not the dominant cost; most growth is process-private configured runtime state.

## Priority gaps

1. **Startup (P0):** profile the first isolated launch and divide time among Node/module loading, configuration/context discovery, extension/skill loading, provider initialization, persistence, and TUI rendering. Establish cold/warm TUI and RPC baselines with retained artifacts.
2. **Multi-session efficiency (P0):** retain lifecycle isolation until private/shared memory attribution proves safe ownership boundaries; reduce repeated configured package initialization without weakening extension order, credentials, transcript, workspace or owner isolation.
3. **Product identity (P1):** rewrite primary Pi-branded install/run documentation to use Recode identity and `recode`; the package itself already exposes `recode`.
4. **Background security (P1):** do not position unattended workers as sandboxed. Tools and extensions operate with host-user privileges; background or untrusted-repository workflows need explicit containment.
