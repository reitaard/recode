# Recode implementation ledger

This file tracks implementation against [`PLAN.md`](PLAN.md). It records only work actually started or completed; proposed work remains in the plan.

## Status legend

- `not started`
- `in progress`
- `blocked`
- `complete`

## Current phase

### S0 — Startup measurement contract

**Status:** complete  
**Started:** 2026-07-28  
**Completed:** 2026-07-28

#### Scope

- [x] Repair parsing of named startup timing groups.
- [x] Preserve timing namespaces so duplicate phase labels such as `TOTAL` cannot overwrite each other.
- [x] Enable timing instrumentation explicitly for profiler children.
- [x] Add an optional machine-readable, redacted per-run benchmark artifact contract.
- [x] Add focused parser/redaction/artifact regression tests.
- [x] Add structured milestones for session selection/restoration state, session readiness, first TUI frame, TUI input readiness, integration readiness, prompt acceptance, provider request dispatch, and first streamed model event.
- [x] Capture milestones in every benchmark artifact.
- [x] Inject a unique benchmark sentinel only after `tui-input-ready`, observe it through the real `ProcessTerminal` input path, and stop timing only when the rendered terminal write contains that sentinel.
- [x] Keep process teardown separately available as `processElapsedMs`.
- [x] Run and record the S1 baseline matrix without destructive cache manipulation.

#### Evidence before implementation

- The profiler searched for `--- Startup Timings ---`.
- Recode emits `--- Startup Timings: main ---` and `--- Startup Timings: extensions ---`.
- Consequently, benchmark wall time was reported while phase timing data was silently discarded.
- A direct configured trace measured 40,305 ms cold and 2,519 ms on an immediate warm run; installed extension module loading dominated both traces.
- The profiler did not itself set `PI_TIMING=1`, so phase capture depended on the caller environment.

#### Work log

- 2026-07-28: Read repository operations/update records and confirmed unrelated staged `.gitignore` and `.pi/memory/MEMORY.md` changes will not be touched.
- 2026-07-28: Began full inspection of `scripts/profile-coding-agent-node.mjs` and `packages/coding-agent/src/core/timings.ts`.
- 2026-07-28: Replaced the unnamed, first-block-only parser with a parser that captures every named timing namespace, Windows path labels, decimal values, and independent namespace totals.
- 2026-07-28: Made the profiler set `PI_TIMING=1` for every benchmark child instead of depending on the caller’s environment.
- 2026-07-28: Added `--artifact-dir` and `--cache-state uncontrolled|cold|warm`. Cache state is explicit and defaults to `uncontrolled`; the profiler does not falsely infer a cold or warm OS cache.
- 2026-07-28: Added schema-versioned per-run JSON containing source/package identity, runtime/platform, lifecycle endpoint, isolated/configured state, declared cache state, elapsed time, loaded package identities, and all timing groups.
- 2026-07-28: Redacted creator filesystem roots from timing labels while retaining package identity and repository-relative labels.
- 2026-07-28: Completed an isolated RPC smoke run. It reached `get_state` in 1,569.4 ms and the artifact retained `main` and `extensions` timing groups.
- 2026-07-28: Added the gated `PI_STARTUP_PROBE` event protocol. Events contain only schema version, milestone name, process-relative elapsed time, and explicitly supplied bounded metadata.
- 2026-07-28: Instrumented session selection/readiness, TUI first render scheduling, completed TUI initialization, accepted model prompts, provider dispatch, and first assistant stream event.
- 2026-07-28: Found that wrapping the native Windows process with MSYS `script`/`winpty` did not expose a TTY to Node. Replaced that host-dependent approach with a deterministic benchmark transport through the actual `ProcessTerminal` input and terminal-write paths.
- 2026-07-28: Forced interactive mode only when `PI_STARTUP_BENCHMARK=1`, skipped ordinary piped-stdin ingestion in that mode, and injected a unique sentinel after `tui-input-ready`. This fixed the benchmark-only stdin deadlock.
- 2026-07-28: Added `tui-input-echo`, emitted only when the rendered terminal write contains the sentinel. TUI elapsed time now ends at observed rendered echo rather than initialization or process exit.
- 2026-07-28: Instrumented both legacy `AgentSession` and the active AgentHarness-based Aizen runtime for prompt acceptance, provider dispatch, and first streamed assistant event.
- 2026-07-28: Preserved the session’s original restored/new classification before runtime initialization mutates a new session with initial metadata.

#### Validation

- `node --check scripts/profile-coding-agent-node.mjs` — passed.
- `node --check scripts/profile-startup-artifact.mjs` — passed.
- Initial `node --test scripts/profile-startup-artifact.test.mjs` — 4 passed, 0 failed.
- Expanded `node --test scripts/profile-startup-artifact.test.mjs` — 5 passed, 0 failed.
- `packages/coding-agent`: initial `startup-probe.test.ts` — 1 passed, 0 failed.
- Final focused validation across startup probe, process terminal, Aizen runtime, and Aizen runtime profile — 10 passed, 0 failed.
- Two attempted Vitest paths based on the repository’s hoisted-dependency example failed because this checkout keeps Vitest under `packages/coding-agent/node_modules`; the corrected package-local command above passed.
- Isolated artifact smoke benchmark — passed.
- First `npm run check` — passed; Biome checked 904 files with no fixes.
- Second `npm run check` after lifecycle instrumentation — passed; Biome checked 906 files and sorted imports in two task-local files. Dependency/import/shrinkwrap/install-lock checks, TypeScript, and browser smoke all passed.
- `git diff --check` — passed.

#### Files changed

- `Analyze/IMPLIMENT.md` — implementation ledger.
- `scripts/profile-coding-agent-node.mjs` — timing capture, explicit instrumentation, namespaced summaries, and artifact output.
- `scripts/profile-startup-artifact.mjs` — parser, flattening, redaction, and schema-versioned artifact construction.
- `scripts/profile-startup-artifact.test.mjs` — focused parser, namespace, milestone, artifact, and redaction regressions.
- `packages/coding-agent/src/core/startup-probe.ts` — gated, once-per-process structured lifecycle milestone emitter.
- `packages/coding-agent/src/main.ts` — session and interactive readiness milestones.
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts` — first scheduled TUI-frame milestone.
- `packages/coding-agent/src/core/agent-session.ts` — prompt acceptance and first model-stream milestones.
- `packages/coding-agent/src/core/sdk.ts` — provider-request dispatch milestone.
- `packages/coding-agent/src/core/recode-aizen-runtime.ts` — active Aizen prompt/provider/first-event milestones.
- `packages/coding-agent/src/modes/interactive/recode-process-terminal.ts` — rendered input-echo proof.
- `packages/coding-agent/test/startup-probe.test.ts` — emission, waiting, deduplication, and bounded metadata regression.
- `packages/coding-agent/test/recode-process-terminal.test.ts` — rendered sentinel regression.

### S1 — Representative startup baseline

**Status:** complete  
**Started:** 2026-07-28  
**Completed:** 2026-07-28

#### Method

- Runtime: Node 26.5.0 on Windows x64.
- Lifecycle endpoints are not mixed: RPC uses successful `get_state`; TUI uses rendered input echo; model latency uses the first streamed assistant event.
- Offline mode was used for startup runs, not for the three real model probes.
- No OS cache, user package cache, or installed extension source was deleted or modified. The first configured run is therefore labeled `uncontrolled`, not falsely labeled cold.
- Warm summaries use one warmup plus five measured child processes.
- Artifacts and the selected warm CPU profile are under the temporary `recode-s1` directory, outside the repository.

#### Results

| Scenario | Endpoint | Result |
|---|---|---:|
| Isolated warm RPC | `get_state` | median 1,616.9 ms; range 1,580.6–1,672.9 ms |
| Isolated warm TUI | rendered input echo | median 1,834.9 ms; range 1,774.6–1,843.4 ms |
| Configured first run, cache uncontrolled | `get_state` | 33,852.4 ms |
| Configured warm RPC | `get_state` | median 4,046.8 ms; range 3,921.0–4,641.6 ms |
| Configured warm TUI | rendered input echo | median 4,078.8 ms; range 4,043.6–4,877.8 ms |
| Configured real model | process start to first model event | median 8,473.0 ms across 3 runs |
| Configured real model | provider dispatch to first model event | median 3,216.8 ms across 3 runs |

The configured first-run extension total was 32,159 ms. The three largest costs were:

1. `pi-mcp-adapter` module import — 21,329 ms;
2. RePi/OpenClaw browser entry module import — 8,933 ms;
3. `pi-web-access` module import — 1,313 ms.

Configured warm extension loading still dominated at a 2,414 ms RPC median and 2,368 ms TUI median. Warm `interactiveMode.init` itself was only 132 ms median. The optimization target is therefore the installed package runtime contract, not TUI rendering.

#### Additional evidence

- One warm configured CPU profile completed at 4,375.8 ms.
- Three real fixed prompts (`Say exactly: ok`) completed successfully.
- Their process-start first-event values were 9,894.7 ms, 7,893.2 ms, and 8,473.0 ms.
- Their provider-to-first-event values were 3,216.8 ms, 3,174.8 ms, and 3,675.8 ms.
- A cold CPU profile and a configured cold TUI duplicate were not manufactured by deleting caches. The uncontrolled first-load RPC trace already isolates the shared pre-TUI package-loading path.

#### Validation and cleanup

- The first final `npm run check` exposed generated AI model catalogue changes created by the earlier package build. Only those build-generated files were restored as permitted by `OPERATIONS.md`.
- `npm run check` then passed with no fixes: dependency, import, shrinkwrap, install-lock, TypeScript, and browser smoke checks all passed.
- Temporary ad-hoc first-model probe source was removed after execution.
- `git diff --check` passed.

### S2 — Release-grade package runtime architecture

**Status:** complete
**Started:** 2026-07-28
**Completed:** 2026-07-28

#### Accepted implementation order

1. [x] Inventory the current extension resolution, TypeScript/Jiti loading, registration, readiness and shutdown contracts.
2. [x] Define the first version of the built artifact and compatibility contract.
3. [x] Define activation, readiness and shutdown ownership vocabulary without weakening dynamic extensions.
4. [x] Integrate contract discovery, compatibility checking, file/hash verification and fail-closed loading into package resolution.
5. [x] Expose source-only compatibility packages through host runtime and `/extensions` diagnostics.
6. [x] Add source-only, verified and rejected package-runtime counts to benchmark artifacts alongside loaded package identities.
7. [x] Separate deterministic factory registration from declared backend readiness state.
8. [x] Migrate the controlled private `repi-browser` package end to end with a built artifact, source map, hash, declarations and host registration proof.
9. [x] Re-run the matched warm S1 RPC/TUI endpoints after the authorized coding-agent build; no feature disappeared and every endpoint stayed within the 10% phase guard.

#### Implemented

- Added contract version 1 for extension runtime artifacts.
- A declared artifact must identify its source entry, built JavaScript entry, optional source map, SHA-256, Recode compatibility range, activation scope, readiness contract and shutdown contract.
- Activation is explicitly `session`, `process` or `service`.
- Readiness is explicitly `registered`, `session-start` or `explicit`.
- Shutdown is explicitly `session-shutdown`, `process-stop` or `explicit`.
- Package paths must be safe `./`-relative paths; traversal, backslashes and TypeScript runtime entries are rejected.
- Omitted contracts remain distinguishable as source-only compatibility packages rather than being silently treated as certified artifacts.
- Package inspection now validates semantic-version compatibility, source/built/source-map existence, duplicate source declarations and exact entry SHA-256.
- Declarative metadata now covers tools, commands, providers, permissions, service dependencies and project-trust requirements.
- Package diagnostics distinguish deterministic registration from backend readiness. Registration readiness completes after factory registration; session-start readiness completes only after awaited `session_start`; explicit readiness remains pending rather than being reported ready.
- Declared contracts take precedence over legacy `pi.extensions`; invalid, incompatible, missing or tampered artifacts fail closed and cannot silently fall back to TypeScript source.
- Verified package discovery loads the built JavaScript entry instead of the declared TypeScript source.
- Package-manager resources now pass through runtime inspection before loading; verified source entries are replaced with built entries and rejected packages are removed from the load set.
- Runtime status is exposed on `LoadExtensionsResult`; `/extensions` diagnostics warn when a configured package still incurs source-only runtime transpilation.
- The `session-ready` startup milestone and retained benchmark artifact now include source-only, verified and rejected package counts without exposing configured package source strings.
- `repi-browser` is accepted as a required first-party certified package and is now the first controlled migration completed locally despite remaining private. Public redistribution still requires explicit license/distribution terms.
- Its private package worktree now builds `dist/openclaw-entry.js` plus source map, updates the runtime SHA-256, declares `browser` capabilities and process ownership, and exports the built entry.
- The installed external packages were repaired and updated with scripts disabled: `pi-web-access@0.15.0`, `pi-mcp-adapter@2.15.0`, and exact shared upstream Pi AI/TUI compatibility runtimes at `0.81.1`.
- A configured resource-loader probe now registers browser, MCP, web search/fetch/content and source-check tools without errors. Web access had previously been broken by the old `pi-ai@0.74.2` missing the `./compat` export.

#### Installed extension audit

Detailed evidence is in [`EXTENSIONAUDIT.md`](EXTENSIONAUDIT.md).

- All three configured packages currently load and expose their intended tools; none is missing or immediately broken.
- `pi-web-access`, `pi-mcp-adapter` and `repi-browser` are all source-only TypeScript packages without built entrypoints, hashes, source maps or lifecycle declarations.
- MCP has substantial internal session lifecycle handling, but readiness is private `state`/`initPromise` behavior rather than a host contract.
- Browser ownership is intentionally process-global with explicit stop, which must be declared as process/service activation rather than modeled as ordinary session shutdown.
- Web access and MCP import upstream `@earendil-works` AI/TUI runtime values. This creates duplicate runtime graphs and requires a deliberate compatibility policy.
- `repi-browser` is private and `UNLICENSED`; it remains required in certified private Recode artifacts, while public redistribution requires explicit license/distribution terms.

#### Validation

- Initial `extension-package-runtime-contract.test.ts` — 5 passed, 0 failed.
- Expanded runtime-contract, package-resolution, readiness, extension-discovery and session-event validation — 47 passed, 0 failed.
- Startup artifact parser/schema validation — 5 passed, 0 failed.
- Broader resource-loader run — 61 passed; 1 Windows environment failure because unprivileged `symlinkSync(..., "dir")` returned `EPERM` before exercising loader code.
- RePi Browser syntax/load/built checks passed; 144 source modules syntax-checked, 65 source modules loaded, and the built artifact exported a valid factory.
- RePi Browser full browser suite — 89 passed, 1 failed twice because the real-Chrome download event timed out after 5 seconds in `browser-files.test.mjs`; the failure is not in the build/runtime-contract path.
- Direct Recode host probe loaded the built browser extension, registered `browser`, and returned no errors.
- `npm pack --dry-run --ignore-scripts` included both the built entry and source map: 116 files, 490,473-byte archive estimate.
- Configured package probe registered all six current tools with no extension errors; immediate warm package loading measured 1,772.2 ms. This was not substituted for the matched S1 process endpoint.
- Matched post-S2 warm endpoints:
  - configured RPC median **3,761.5 ms**, down **7.0%** from 4,046.8 ms;
  - configured TUI rendered-input median **4,264.9 ms**, up **4.6%** from 4,078.8 ms;
  - isolated RPC median **1,521.3 ms**, down **5.9%** from 1,616.9 ms;
  - isolated TUI rendered-input median **1,723.7 ms**, down **6.1%** from 1,834.9 ms.
- Every matched warm endpoint remained inside the 10% regression guard. S2 provides a large uncontrolled first-load improvement for the browser artifact, but no matched cold claim is made because caches were not destructively cleared.
- The first S2 `npm run check` identified unsafe `unknown` narrowing in contract construction; explicit validated locals replaced the invalid assumptions.
- Final `npm run check` passed: Biome, dependency/import checks, shrinkwrap/install lock, TypeScript and browser smoke.
- `git diff --check` passed.

#### Files changed

- `packages/coding-agent/src/core/extensions/package-runtime-contract.ts` — contract types and strict parser.
- `packages/coding-agent/test/extension-package-runtime-contract.test.ts` — valid, omitted, traversal, compatibility, existence, hash, lifecycle and version regressions.
- `packages/coding-agent/src/core/extensions/loader.ts` — verified built-entry selection and fail-closed contract discovery.
- `packages/coding-agent/src/core/extensions/types.ts` — package runtime diagnostic result contract.
- `packages/coding-agent/src/core/resource-loader.ts` — configured-package runtime resolution, built-entry substitution and diagnostics.
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts` — visible source-only package warning.
- `packages/coding-agent/test/extensions-discovery.test.ts` — built-entry precedence and tamper refusal regressions.
- `packages/coding-agent/test/extension-package-runtime-resolution.test.ts` — source-only, verified-entry and invalid-package resolution regressions.
- `scripts/profile-startup-artifact.mjs` and its test — safe package-runtime status counts in retained benchmark artifacts.
- `analyze/COMPARE.md` — explicit mapping from the overall comparison to active and later implementation tracks.
- Private `repi-browser` package worktree: committed locally as `6105993645f3578bf989393704bcc97c0e06e156` on local branch `s2-runtime-contract`; includes `package.json`, `package-lock.json`, `scripts/build-extension.mjs`, `test/load-built.mjs`, and generated `dist/` artifact/source map.
- Global Recode settings now pin the private browser package to `6105993645f3578bf989393704bcc97c0e06e156`; remote branch `origin/s2-runtime-contract` was verified at the same commit, making reinstall by exact pin reproducible.
- Installed package root `C:/Users/re_Lax/.pi/agent/npm`: exact updated web/MCP and compatibility dependencies plus refreshed lockfile.
- `Analyze/EXTENSIONAUDIT.md` — installed-package audit, repaired web-access compatibility and completed local `repi-browser` migration status.

### S3 — Split lifecycle readiness levels

**Status:** complete
**Started:** 2026-07-28
**Completed:** 2026-07-28

#### Implemented

- Added the missing `model-ready` startup milestone and emit it only when a model is selected and provider dispatch can begin.
- Moved `tui-input-ready` to the actual editor-ready point immediately after the first rendered frame, before extension session initialization completes.
- Moved `integration-ready` to after awaited extension binding/session-start and emit it only when no package remains pending.
- Removed the inaccurate benchmark-only readiness emissions that previously reported input and integrations ready together after full `InteractiveMode.init()`.
- Added process-local `LifecycleReadiness` state with independent frame, input, session, integration and model levels, idempotent transitions, immutable detached snapshots, subscriptions and session generations.
- Frame/input readiness survives session replacement; session/integration/model readiness resets for each generation.
- Interactive and RPC rebinding explicitly returns integration state to pending until package session-start work completes.
- Initial and subsequently selected models complete model readiness in both interactive and RPC modes.
- RPC `get_state` now exposes the structured readiness snapshot for supervisors and future clients.

#### Validation

- Focused readiness, runtime-event, RPC, startup-probe and terminal tests: **19 passed**.
- Full `npm run check` passed.
- Configured warm five-run TUI milestone medians:
  - session ready: **4,135.3 ms**;
  - model ready: **4,135.4 ms**;
  - frame/input ready: **4,160.1 ms**;
  - rendered input echo: **4,221.6 ms**;
  - integration ready: **4,266.6 ms**.
- The measured editor accepted and rendered input before optional integration completion. No cold-cache state was manufactured.
- Generated AI catalogue changes caused by the authorized benchmark build were restored without touching task or unrelated staged files.

### O0 — Freeze Maestro contract and characterize inherited behavior

**Status:** complete
**Started:** 2026-07-28
**Completed:** 2026-07-28

- Locked Recode Maestro and the accepted CLI contract in `update/DECISIONS.md` D-016.
- Compared exact current Recode, upstream Pi server and Phase 4A routing sources.
- Froze Hermes source at `5b22bd955682a8fc7b07769784c5129e23f53eaf` and classified every reviewed lifecycle, budget, lineage and lease behavior.
- Added one consolidated characterization suite covering first state/event/UI routing, unexpected exit, cooperative stop and restart normalization: **4 passed**.
- Corrected the inherited Node spawn resolver: `createRequire().resolve()` could not resolve the import-only `./rpc-entry` export; Maestro now uses `import.meta.resolve()` plus `fileURLToPath()`.
- Added an injectable spawn seam solely to keep lifecycle tests deterministic and token/network free.
- Kept the suite dependency-free with `node:test`; no package or lockfile churn was retained.
- Full `npm run check` and `git diff --check` passed.
- Detailed source evidence and the Hermes mapping are in [`MAESTRO-O0.md`](MAESTRO-O0.md).

### O1 — Port the public lifecycle model

**Status:** complete
**Started:** 2026-07-28
**Completed:** 2026-07-28

- Added contract version 1 with explicit pending, starting, running, cancellation and terminal states plus a closed legal-transition table.
- Added bounded launch, handle, status, wait, cancel, result, reconnect, attach, subscribe, detach and destructive stop contracts.
- Added random capability-bearing handles, parent-scoped correlation uniqueness, generation-safe interactive attachments, bounded progress/result snapshots, terminal hashes and one-hour configurable terminal retention.
- Added private worker and full-session adapters; neither adapter exposes a worker, child process or session resource to callers.
- Added fail-closed process/session identity validation for full sessions and isolated subscriber failures from lifecycle control flow.
- Added cancellation-safe launch acquisition: early cancel/stop cannot leave a subsequently acquired full-session resource running.
- Translated the relevant Hermes lifecycle conformance behaviors and added Recode-specific process/reconnect cases: **10 O1 tests passed**; with O0 characterization, **14 orchestrator tests passed**.
- Levi's focused audit identified launch-acquisition, observer, retention and runtime-boundary defects; all four received focused regression coverage and fixes. A requested second audit run terminated without a result and was not retried.
- Replaced `--aizen` with explicit `recode aizen` parsing and migration diagnostics as approved by D-016; bare `recode` remains settings/default driven.
- Coding-agent argument suite: **74 passed**.
- Full `npm run check` and `git diff --check` passed.
- Persistence, process-safe capability durability, deadline/escalation, iteration-budget integration and session turn leases remain O2–O4 work.

### O2 — Atomic persistence and terminal retention

**Status:** complete
**Started:** 2026-07-28
**Completed:** 2026-07-28

- Replaced direct manifest overwrites with same-directory exclusive temporary files, file flush, atomic rename and best-effort directory flush.
- Added validated bounded backups that are refreshed only from a valid current manifest, so corrupt current state cannot overwrite the last known-good backup.
- Added fail-closed schema/bounds validation for machine and instance records, duplicate instance IDs and process identity receipts.
- Added bounded observable storage diagnostics for invalid current state, invalid backup state, successful backup recovery and unrecoverable corruption.
- Added one-hour configurable terminal retention and required completion timestamps for stopped, succeeded, failed and cancelled records.
- Changed explicit stop to retain a cancelled terminal snapshot; failed spawn and unexpected exit retain failed snapshots; restart-normalized live records retain stopped snapshots.
- Added PID plus independently observed process-start receipt verification; PID equality alone never authorizes adoption or termination.
- Added injected RPC-process/presence boundaries to keep supervisor persistence tests deterministic and network-free.
- O2 storage/lifecycle tests: **7 passed**; all O0–O2 orchestrator tests: **21 passed**.
- Full `npm run check` passed. O3 owns RPC deadlines, cancellation completion and shutdown escalation.

### O3 — Deadlines, cancellation and shutdown

**Status:** complete
**Started:** 2026-07-28
**Completed:** 2026-07-28

- Added a configurable default deadline to every response-bearing RPC request, deadline cleanup, per-request abort signals and typed timeout/cancel errors.
- Added best-effort remote prompt abort on local deadline/cancellation and command-scoped cancellation for active prompt IDs.
- Added public instance cancellation through the supervisor and IPC protocol with requested, accepted, completed, unsupported and unknown outcomes.
- Prevented stale request-ID reuse and stale attachment generations from cancelling newer work.
- Added bounded pending requests, one concurrent prompt per RPC process, bounded request identities, stdout/stderr buffers, live sessions and subscribers.
- Isolated RPC event/UI observer exceptions from transport control flow and fail-closed malformed or oversized child output.
- Replaced unbounded SIGTERM waiting with configurable graceful deadline, SIGKILL escalation, bounded forced-exit verification and persisted termination outcomes.
- Recorded unverified forced termination as failed rather than claiming a successful stop.
- Made multi-instance supervisor shutdown concurrent so one child's shutdown window does not delay starting shutdown for another child.
- Added six dedicated RPC deadline/cancellation/shutdown tests and extended lifecycle/storage tests for stale ownership, failed termination, live limits and concurrent shutdown. All O0–O3 orchestrator tests: **29 passed**.
- Rechecked O1–O3 against the clean frozen Hermes checkout at `5b22bd955682a8fc7b07769784c5129e23f53eaf`; retained only mapped lifecycle/process invariants and removed the obsolete lossy `removeInstance()` path.
- The checkpoint classification is recorded in [`MAESTRO-O3-CHECKPOINT.md`](MAESTRO-O3-CHECKPOINT.md).
- Full `npm run check` and `git diff --check` passed. O4 owns durable-session turn leases and rotation-safe rebind.

### O4 — Session turn lease

**Status:** complete
**Started:** 2026-07-28
**Completed:** 2026-07-28

- Ported Hermes's session-ID-keyed lease invariant from frozen local source while intentionally replacing timeout fail-open with an explicit `TurnLeaseTimeoutError`.
- Added FIFO serialization by resolved durable session ID, so different instance/client aliases cannot interleave transcript turns.
- Added identity- and generation-scoped idempotent release; stale tokens cannot free newer holders.
- Added soft-bounded idle eviction that never evicts held or contended leases.
- Added held-lease alias rebind when compaction rotates the durable session ID and fail-closed conflict behavior when the target domain is already live.
- Integrated prompt lease acquisition into both unary and streaming supervisor RPC paths; read-only state/events remain concurrent.
- Held prompt leases through the authoritative `agent_settled` boundary rather than releasing at prompt preflight response.
- Synchronized and rebound session identity on `compaction_end`, then synchronized and released in order on `agent_settled`.
- Released held leases on RPC failure, unsuccessful prompt preflight, process exit and destructive stop.
- Added five translated registry tests and three Recode supervisor integration tests covering alias serialization, read-only concurrency, rotation rebind and fail-closed timeout.
- All O0–O4 orchestrator tests: **37 passed**. Full `npm run check` and `git diff --check` passed.

### O5 — Attach, detach, waiting input and reconnect

**Status:** complete
**Started:** 2026-07-28
**Completed:** 2026-07-28

- Enforced one interactive owner per live instance in both the public lifecycle service and RPC stream supervisor; duplicate owners fail explicitly rather than silently replacing the current owner.
- Added concurrent read-only RPC streams with an explicit non-mutating command allowlist and isolated subscriber failures.
- Made client close a non-destructive detach; only explicit stop disposes the child process.
- Added generation-scoped interactive ownership so stale stream cleanup and responses cannot affect a newer attachment.
- Persisted bounded blocking UI requests, transitioned detached sessions to `waiting-input`, and replayed pending input after reattachment or verified service restart.
- Added bounded in-memory event/output tails by entry count, per-event bytes and aggregate bytes; oversized blocking UI requests are cancelled rather than retained unsafely.
- Added current instance state, attachment identity and bounded replay to the RPC stream-ready response.
- Added restart reconnection adapters that require matching independently observed process identity, transport identity, durable session ID and session file before adoption.
- Required reconnect transports to support non-destructive detach; unverifiable records become retained `stopped` snapshots with diagnostics and unrelated processes are never killed or adopted.
- Kept production fail-closed when no verifiable reconnect adapter exists; current stdio children cannot be safely reattached after supervisor restart.
- Rechecked the frozen Hermes lifecycle sources: their detached gateway restart machinery does not map to Recode child-session attachment, so no gateway watcher or auto-respawn behavior was ported.
- Added four focused O5 tests covering owner exclusion, read-only access, non-destructive detach, waiting-input replay, bounded tails, successful verified reconnect and session-mismatch refusal.
- All O0–O5 orchestrator tests: **41 passed**. Full `npm run check` and `git diff --check` passed.

### O6 — Completion queue and Aizen handoff

**Status:** complete
**Started:** 2026-07-28
**Completed:** 2026-07-28

- Added a separately persisted, schema-validated completion ledger keyed by authoritative parent instance or durable parent session identity.
- Bounded summaries to 4,000 characters, the active ledger to 256 entries by default, individual claims to 64 records and retained acknowledged records to one hour.
- Refused queue overflow rather than evicting an unacknowledged completion; acknowledged entries may be compacted safely when capacity is needed.
- Added generation-scoped claims, foreign-owner lease exclusion, same-owner restart reclaim, stale-claim rejection, explicit release and idempotent acknowledgement.
- Made lifecycle completion enqueue synchronous before reporting `handoffState: queued`; unavailable or failed persistence is surfaced explicitly in the terminal result.
- Added supervisor delivery on enqueue, parent `agent_settled`, initial spawn and verified reconnect, serialized per parent so concurrent drain attempts cannot duplicate delivery.
- Added a dedicated coding-agent RPC handoff that refuses active Aizen turns, appends one hidden durable context message, detects persisted delivery IDs and treats child text as explicitly untrusted supporting material.
- Preserved only the bounded summary and child instance/session link; no private child transcript is copied into the parent.
- Added three coding-agent handoff tests and four orchestrator queue/lifecycle/delivery tests. All coding-agent handoff tests passed **3/3**; all O0–O6 orchestrator tests passed **45/45**.
- Full `npm run check` passed.

### O7 — Workspace safety

**Status:** complete
**Started:** 2026-07-28
**Completed:** 2026-07-28

- Added canonical workspace ownership receipts containing only the selected path, worktree root, Git common directory, stable worktree identity, branch, access mode and owning instance.
- Marked every receipt `managed: false`; Maestro never creates, merges, resets, stashes, removes or cleans a worktree.
- Defaulted direct supervisor admission to read-only and required explicit `--write` at the CLI boundary for write-capable sessions.
- Started read-only RPC children with `--no-tools`, marked their environment, blocked direct bash/export writes and rejected slash-extension invocation through the read-only prompt path.
- Allowed read-only sessions to share a selected workspace while rejecting a second writer on the same canonical worktree.
- Required a write-capable child of an active writer to use a distinct sibling worktree with the same canonical Git common directory.
- Rejected new writers when any active ownership record is missing or ambiguous rather than guessing cleanup or workspace identity.
- Persisted lineage and workspace receipts in the bounded atomic instance manifest and exposed only minimal active-worktree context through IPC summaries.
- Required workspace receipt verification before restart reconnect; legacy or drifted ownership records are retained as stopped diagnostics and are never adopted blindly.
- Added four focused O7 workspace tests and one process-launch regression. All O0–O7 orchestrator tests passed **50/50**.
- Full `npm run check` and `git diff --check` passed.

## O8 — Core service supervision and TUI integration

**Completed:** 2026-07-29

- Added one process-start-verified Maestro owner receipt, atomic persisted health, bounded crash history, and rapid-crash degradation diagnostics.
- Added explicit `starting`, `ready`, `degraded`, `draining`, `stopped`, and `crashed` service states with independent Radius adapter health.
- Added Linux systemd user-service generation with restart-on-failure and `KillMode=control-group` containment.
- Added a reviewed Windows Task Scheduler path whose PowerShell host assigns Maestro to a kill-on-close Job Object before service initialization can spawn full-session children.
- Implemented option A stop/restart semantics: reject new mutating admission, close IPC attachments, drain full sessions within a deadline, persist the exit classification, then let the native ownership container terminate any remaining descendants.
- Kept native supervision single-owner and refused concurrent fallback-watcher configuration.
- Added bounded IPC client deadlines and response buffers, verified attachment ownership, live/persisted session merging, and bounded sanitized activity/output summaries.
- Added `recode maestro` routing, native service management, health/list/spawn/control commands, and a full-screen modern-minimal board with workspace, branch, elapsed state, current activity, pending input, latest output, attach/detach, prompt, cancel, and double-confirmed stop.
- Added a non-blocking Aizen footer monitor that disappears when Maestro is unavailable and cannot be erased by extension status cleanup.
- Preserved `Alt+Up` and added configurable `Ctrl+Shift+J` as a VS Code terminal-safe queued-message fallback.
- Added Maestro to npm/local/custom packaging and added a separate `recode-maestro` executable to Bun release archives so the service remains independently supervised without loading Maestro during ordinary Aizen startup.
- Verified the Windows manual service path end to end: ready health over the named pipe, planned shutdown acknowledgement, zero exit, owner release, and persisted `planned-stop` health.
- Added focused service-containment, ownership, health/shutdown, socket-shutdown, dashboard, footer, and keybinding regressions; all orchestrator tests passed **57/57** and focused coding-agent O6/O8 tests passed **12/12**.

## V1 lifecycle closure — O1/O3/O6 production integration

**Completed:** 2026-07-29

- Made `MaestroLifecycleService` plus `MaestroFullSessionLifecycleAdapter` the production full-session authority over the existing `OrchestratorSupervisor` backend; no second supervisor was added.
- Kept the lifecycle handle instance id identical to the durable supervisor record and exposed production lifecycle status/result for diagnostics and conformance.
- Synchronized production attachment generations and `WAITING_INPUT`/`RUNNING` transitions with the versioned lifecycle state machine.
- Added independently observed Windows/Linux process-start identity to real RPC children before the lifecycle reports `RUNNING`.
- Added independent per-run provider-call iteration budgets: 500 for Aizen and 50 for named workers/Shiori, with race-safe consume/refund behavior and explicit exhaustion errors.
- Persisted terminal state, bounded summary, deterministic result hash and completion-outbox marker in the instance manifest.
- Enqueued one O6 completion from real child terminal transitions and recovered both crash-before-enqueue and enqueue-before-marker windows through the queue's child-id/result-hash idempotency.
- Added production integration, waiting-input, forced-exit, real-terminal producer and outbox recovery regressions.
- Real isolated RPC child smoke passed `RUNNING -> CANCELLED` with a verified process identity.
- Validation passed: all orchestrator tests **59/59**, focused Agent loop/budget tests **23/23**, focused Aizen/worker tests **36/36**, and `npm run check`.

## V1 local control-plane security

**Completed:** 2026-07-29

- Added a private 256-bit current-user IPC token and authenticated every request and RPC-stream handshake before dispatch.
- Persisted the token outside command arguments/responses, verified regular-file identity, repaired/rechecked Unix directory mode `0700`, required auth/socket mode `0600`, and disabled all-user named-pipe read/write flags.
- Replaced full service-environment inheritance with a reviewed runtime/provider allowlist; exceptional MCP/integration variables require explicit `REPI_MAESTRO_CHILD_ENV_ALLOW` names.
- Removed raw child stderr from control-plane errors; diagnostics now expose only bounded byte count and a truncated SHA-256 identity.
- Rejected detached mutating RPC calls unless they carry the current interactive owner and attachment generation.
- Added a narrow absolute-deny bash gate for recursive destruction of filesystem roots, home/credential stores (including traversal forms), raw-device writes, formatting and fork bombs.
- Kept same-user processes explicitly inside the trust boundary; these controls do not claim sandboxing.
- Real isolated RPC lifecycle smoke still passed after environment filtering.
- Validation passed: all orchestrator tests **63/63**, catastrophic-command tests **18/18**, relevant bash/Aizen tests, `npm run check`, and `git diff --check`.

## V2-D — Configured-runtime attribution and immutable ownership

**Status:** in progress
**Started:** 2026-08-02

### Scope

- [x] Add bounded, opt-in memory checkpoints around settings, package runtime resolution, extension activation, resource discovery and provider registration.
- [x] Retain configured and isolated measurements without destructive cache manipulation or provider generation requests.
- [x] Attribute the configured-minus-isolated private-memory delta before selecting an optimization.
- [ ] Optimize only immutable metadata or an explicit service-owned boundary with content/version invalidation.
- [ ] Re-run startup, private-memory and feature-preservation checks after each accepted change.

### Safety boundary

- Kioku retrieval, embeddings, reranking, indexes and durable memory are out of scope.
- Credentials, transcripts, workspace/session state, approvals, extension runtime objects and mutable provider state remain process/session isolated.
- No configured feature may be disabled merely to improve a benchmark.
- Uncontrolled-cache results are labeled as such and are not cold-start claims.

### Work log

- 2026-08-02: Creator approved V2-D as the next implementation phase.
- 2026-08-02: Reconfirmed the V2-C baseline: configured RPC averaged 485.7 MB private working set versus 129.1 MB isolated, leaving an unattributed configured-state delta of approximately 356.6 MB per process.
- 2026-08-02: Audited production initialization. The first required seam is package/extension loading in `DefaultResourceLoader.reload()`, followed by provider registration in `createAgentSessionServices()`; sharing instantiated extension runtimes or model registries was rejected as unsafe.
- 2026-08-02: Added startup-probe memory checkpoints containing only process memory counters and bounded resource counts. No paths, credentials, model content, transcripts or workspace content are emitted.
- 2026-08-02: Three configured versus three isolated warm RPC runs attributed only 4.3 MB RSS to settings/package resolution, but 142.4 MB RSS and 85.5 MB used heap after extension activation. Resource discovery and provider registration added less than 0.5 MB RSS after that boundary.
- 2026-08-02: Selected the Browser package's eager Ghostery blocker initialization as the first bounded defect. It fetched and allocated prebuilt filter data during module import even when Browser was stopped and ad blocking was disabled.
- 2026-08-02: Changed the controlled private Browser candidate to create the blocker promise only when a block-enabled page needs it. A focused import regression and built-artifact load passed.
- 2026-08-02: Matched three-run configured RPC startup stayed inside the 10% guard (+4.0%, no speed claim). Average `extensions-ready` RSS fell by 23.0 MB; held-RPC private working set fell by 75.8 MB on average and 30.9 MB at the median. Eager samples were highly variable because asynchronous filter retrieval/allocation continued after startup.
- 2026-08-02: Retained the bounded results under `Analyze/evidence/v2-d-2026-08-02/`. Results use uncontrolled OS cache and are not cold-start or Linux PSS claims.
- 2026-08-02: Focused coding-agent startup/resource/session tests passed 12/12. Root `npm run check` passed. The private Browser package passed syntax, 65-module load, built-artifact load and 90/91 browser tests; the sole failure was the previously observed real-Chrome download-event timeout after five seconds, outside the blocker path. The focused lazy-blocker regression passed independently.
- 2026-08-02: Committed and pushed the Browser candidate as `c000d5d4016b9589759e2e0f630cfb6e0f6845b0` on `origin/v2-d-lazy-blocker`; global Recode settings now pin that exact commit.
- 2026-08-02: Committed the coding-agent attribution checkpoint as `86165ed92a2c977911da059b8595e9b53573b7e0`, built exact `0.81.6` tarball SHA-256 `3d85fb67a1a1e1bb1cd711dba9b6b7a2c0d610fecef0d8caf9cbd13f8a8b7b74`, passed isolated version/help/model/release-identity/offline-RPC checks and installed it into the active Node global prefix with lifecycle scripts disabled. The prior `0.81.5` global package is retained as rollback tarball SHA-256 `bc231c5434ce5f76845bcc89d6549c18085a79cd9efdd74dfbfffb317d9389da`.

### Current candidate files

- `packages/coding-agent/src/core/startup-probe.ts` — bounded opt-in process-memory checkpoints.
- `packages/coding-agent/src/core/resource-loader.ts` — settings, package, extension and resource phase checkpoints.
- `packages/coding-agent/src/core/agent-session-services.ts` — provider-registration checkpoint.
- `packages/coding-agent/test/startup-probe.test.ts` — bounded memory payload regression.
- Private `repi-browser` package — lazy blocker initialization, import regression and regenerated verified extension artifact.
- `Analyze/evidence/v2-d-2026-08-02/` — matched attribution and first-candidate evidence.

## Comparison traceability

The implementation is governed by [`analyze/COMPARE.md`](COMPARE.md), not only its startup section. `Analyze/PLAN.md` maps the complete comparison into startup/package work, lifecycle/service work, matched three-way validation and P0–P4 distribution, preservation, safety, memory and integrated-product work. S3 is current because accurate independent readiness boundaries are required before lifecycle/service work can improve perceived and complete startup honestly.

## Accepted post-lifecycle checkpoint

After S2–S3 and the O0–O8 Hermes lifecycle/service checkpoint:

- clone a fresh exact jcode revision;
- fetch an exact upstream Pi revision without changing the Recode branch;
- map behavioral test contracts before comparing test counts;
- run native and translated conformance tests;
- benchmark matched frame, input-echo, readiness, attach and provider endpoints;
- compare Recode, jcode and upstream Pi as the three products;
- retain Hermes as lifecycle-port provenance rather than a fourth product score;
- ratify S4 and O9 only from that evidence.

## Later phases

S3 and O0–O8, including the V1 O1/O3/O6 production closure, are complete. The next bounded phase will be selected by the Creator between local control-plane security and release/update/certification work. O9, Telegram and the exact jcode checkpoint remain outside this completed lifecycle phase.

## MCP UI viewer default

**Status:** complete
**Completed:** 2026-08-04

- Defaulted Recode's `MCP_UI_VIEWER` process value to `none` at the shared `main()` boundary, covering normal and RPC entrypoints without requiring a shell-level environment variable.
- Preserved explicit `MCP_UI_VIEWER` values, including `browser` and `glimpse`, as opt-in overrides.
- Kept the change scoped to Recode; the external `pi-mcp-adapter` package remains unmodified.
