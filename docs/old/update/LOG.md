# Update Work Log

## 2026-08-10 — Recode v0.83.0 direct-port checkpoint

- Merged the upstream v0.84.1 direct port into `agent-harness` while preserving the active V3 JSONL runtime and inactive Session V4/SQLite/protocol/server source surfaces.
- Set the publishable workspace packages and `repi/product.json` to lockstep `0.83.0`.
- Restored the SQLite backend build inputs and made the local packer bundle the unpublished `@reitaard/repi-telemetry` workspace tarball.
- `npm run check` passed, and the full local package pack/install smoke produced `reitaard-repi-coding-agent-0.83.0.tgz` from source commit `9f2fcd4d`.
- npm publication, release tagging, and remote installation remain separate gated operations.

## 2026-08-09 — Upstream v0.84.1 TUI renderer reconciliation

- Replaced standalone startup and configuration-selector construction of the removed `TUI` class with `TuiMainScreen`.
- Restored the Recode TUI diagnostics public export while retaining its bounded JSONL crash/slow-render logging implementation.
- Added the upstream `tuiMode`, fullscreen-scrollbar, and Mermaid rendering settings contracts to Recode settings.
- Began the interactive renderer composition: `InteractiveMode` now owns a replaceable `TuiMainScreen`/`TuiAltScreen` renderer, stable UI reference, regular/fullscreen component layout, Recode terminal setup, raw capture, Maestro footer status, and right-click paste callback. Terminal setup remains attached to the shared `TUI` interface and therefore survives renderer replacement.
- Validation remains incomplete. Focused settings tests passed, but interactive/terminal-setup tests cannot resolve the unbuilt local `@reitaard/repi-tui` package; `npm run check` reaches TypeScript and reports remaining TUI caller migrations plus pre-existing AI, extension, and optional SQLite reconciliation errors.

## 2026-08-09 — Upstream v0.84.1 direct-port slices

- Created the exact three-way integration worktree for upstream `v0.84.1` (`53fa77ccd8a279eb87e92294ef3687b03ff80112`) from Recode `agent-harness` base `3be0ded8b9e6880650caae05a6314a7d01ccbe42`.
- Retained active V3 `SessionManager` JSONL persistence and moved clean upstream Session V4 source/tests to inactive `harness/session-v4`, without adapters, dual persistence, journals, runtime wiring, or SQLite activation.
- Resolved shared Agent Core, AI, Coding Agent, and TUI source overlaps while preserving Recode namespaces, catastrophic-command safeguards, Windows path behavior, and the V3 Recode session-storage bridge.
- Added complete upstream telemetry as `@reitaard/repi-telemetry`; retained protocol, client, server implementation, evals, and SQLite backend source files without activating them.
- Restored existing Recode documentation, optional SQLite files/tests, and TUI test configuration that upstream removed. The Creator selected lockstep `0.83.0`; dependency reconciliation, validation, release preparation, commit/merge, and installation remain pending explicit gates.


## 2026-08-06 — Recode build and release runbook

- Added `docs/RECODE_BUILD_RELEASE.md` as the detailed procedure for development builds, small-model smoke tests, isolated release candidates, version bumps, GitHub assets, npm boundaries, rollback, and failure recovery.
- Added the project skill `.agents/skills/rebuild/SKILL.md` for bounded small-model execution and linked the runbook from `README.md` and `OPERATIONS.md`.
- Recorded the current release block: do not run the release/tag/publish path until reviewed npm trusted publishing and an idempotent publish workflow exist. Local certification remains allowed; GitHub workflow runtime checks remain a separate manual gate.
- No version bump, tag, publication, installation, remote mutation, or code validation run was performed for this documentation-only change.

## 2026-08-03 — Recode 0.82.1 checkpoint and GitHub assets

- Committed the protected upstream integration at `e6b2b5db9`, then closed configured-runtime blockers for disabled extension discovery, stale compaction model settings, keyless Open Provider authentication, release identity, and full-history CI ancestry through exact release commit `c035bc2fc06d0282ddf0b97210e575a22cd007a2`.
- Updated controlled Browser package compatibility through `4b149a6afe960d9a33e770e828f06e23d261b21d`; its 90/91 suite result retained the known real-Chrome download-event timeout. Updated installed web/MCP packages to their current contract-free releases.
- Published GitHub release `v0.82.1`; workflow run `30787466331` passed all build, preview, staging, and publication jobs. The release contains nine checksummed Windows/Linux/Termux/source/manifest assets.
- Downloaded and verified `recode-windows-x64.zip` against `SHA256SUMS`; binary version/help/model listing, configured RPC startup, Browser/Kioku/Shiori activation, and a real local Open Provider prompt returning exactly `ok` passed.
- Built the exact self-contained Node artifact `reitaard-repi-coding-agent-0.82.1-c035bc2f.tgz`, SHA-256 `8e916dec5c313af6c7e37e9eb11b85238f4b7bb6a0468a34d0d956c65d6d0668`. Isolated version, configured RPC, source identity, and real local prompt passed.
- Global Recode is running functional `0.82.1` from `eb560c2a8`; replacing it with the final metadata-equivalent `c035bc2f` artifact is deferred until the active Recode process releases the Windows clipboard DLL.
- npm publication remains separate because trusted publishing is not configured; no local npm publication was attempted.

## 2026-08-02 — Upstream 0.82.1 credential, AgentHarness, and storage integration

- Integrated the upstream root credential/model runtime while preserving Recode Open Provider, OpenAI OAuth, Radius, Maestro, Shiori, and provider-extension registration. Open Provider key migration from its legacy configuration file into the root store remains a release gate.
- Added native provider support, lazy model-catalog refresh, llama.cpp integration, serialized credential-store methods, and models.json hot reload.
- Integrated AgentHarness tool contexts, compaction usage/retained tails, retry callbacks, session cursors/statistics, UUIDv7, and optional SQLite storage while retaining Recode durable operation journaling and iteration budgets.
- Kept JSONL as the default session backend and `packages/orchestrator` as the sole supervisor; `packages/server` remains a Maestro facade.
- Updated current-catalog test fixtures instead of restoring removed model IDs.
- Advanced workspace packages to lockstep `0.82.1` and regenerated package-lock, coding-agent shrinkwrap, and install-lock metadata with lifecycle scripts disabled.
- Validation passed: 81 focused Agent tests, 22 focused ModelRuntime/compaction/UI tests, 53 focused OAuth/Open Provider/Radius tests, full `npm run check`, browser smoke, and `git diff --check`.
- No commit, release artifact, publication, global installation, or remote mutation was performed.
- A later full `./test.sh` certification run exposed integration and Windows-host regressions, so installation remained blocked. Fixed root stream fallback, tool-result and branch-summary usage accounting, Windows `NodeExecutionEnv` basenames, model-auth header transformation, current model-catalogue expectations, extension `0.82.x` runtime ranges, Open Provider root-credential migration, stale example lockfiles, and shipped Recode identity text. AI now passes 667 tests with 751 provider-gated skips; Agent passes 225 tests with four skips and has only Windows symlink-capability cases excluded plus a path-format assertion corrected. Coding Agent still has unresolved regression/mock/platform failures and must reach its accepted cross-platform gate before packaging.

## 2026-08-02 — Operational Doctor phase

- Implemented the first read-only `recode doctor` foundation with human/JSON output and local identity, configuration, integration, Maestro, memory and LSP checks.
- Rejected presence-only diagnostics as product-complete because they do not explain live failures.
- Refactored the V2 plan around three exact references: Codex Doctor for bounded redacted evidence and failure isolation, Hermes Doctor for broad operational coverage without adopting automatic repair, and jcode Provider Doctor for tiered provider checkpoints and first-blocker guidance.
- Kept the implementation minimal by reusing Open Provider's existing configuration and model-catalogue parser for a bounded non-generation probe.
- Added secret-safe classification for timeout, DNS, refused connection, TLS, HTTP/auth, empty catalogue and missing selected model failures.
- The real configured Open Provider catalogue probe passed with three models; no prompt or model-generation request was made.
- Doctor tests pass 4/4, full `npm run check` passes, and `git diff --check` passes.

## 2026-08-02 — V2-D configured-runtime attribution

- Added opt-in startup-probe memory checkpoints at settings, package runtime, extension activation, resource discovery and provider registration boundaries. Payloads contain only process counters and bounded counts.
- Three configured versus three isolated warm RPC runs attributed only 4.3 MB RSS to package resolution but 142.4 MB RSS and 85.5 MB used heap after extension activation. Sharing mutable extension runtimes and model registries remains rejected.
- Found the controlled Browser package eagerly called `PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch)` during module import even when Browser was stopped and blocking was disabled.
- The first candidate defers blocker retrieval/allocation until a block-enabled page needs it. Average `extensions-ready` RSS fell by 23.0 MB; held-RPC private working set fell by 75.8 MB on average and 30.9 MB at the median. Matched RPC startup changed by +4.0%, inside the 10% guard and not claimed as an improvement.
- Root checks and 12 focused coding-agent tests passed. The private Browser package passed the focused regression, syntax/load/built checks and 90/91 full tests; the sole failure was the previously observed real-Chrome download-event timeout after five seconds.
- The Browser candidate is committed and pushed as `c000d5d4016b9589759e2e0f630cfb6e0f6845b0` on `origin/v2-d-lazy-blocker`; global Recode settings pin the exact commit.
- Committed the coding-agent V2-D checkpoint as `86165ed92a2c977911da059b8595e9b53573b7e0`, built exact `0.81.6` artifact SHA-256 `3d85fb67a1a1e1bb1cd711dba9b6b7a2c0d610fecef0d8caf9cbd13f8a8b7b74`, passed isolated and global version/help/model/release-identity/offline-RPC checks, and installed it under the Node global prefix with lifecycle scripts disabled. The previous global `0.81.5` package is retained as rollback artifact SHA-256 `bc231c5434ce5f76845bcc89d6549c18085a79cd9efdd74dfbfffb317d9389da`.
- Evidence is retained under `Analyze/evidence/v2-d-2026-08-02/`. No destructive cache operation, provider generation request, Kioku behavior change or configured-feature removal occurred.

## 2026-08-02 — Recode 0.81.6 VPS rollout

- Creator explicitly authorized upgrading `root@157.173.127.84` to the latest committed checkpoint.
- Pre-update inventory confirmed Ubuntu Linux x64, private Node `26.5.0`, Recode `0.81.5`, active Maestro with no live instances, 22 bounded agent configuration files and 14 session files. Existing user data was not modified.
- Built `@reitaard/repi-coding-agent@0.81.6` from clean source `f287dff3ac8a9c84522f94bb711566badbc2e609`; local isolated version/help/model/release-identity smoke passed. Artifact SHA-256 is `851368c1e6c8e0ea0dba2806363a584f4ad02a5d515d17f56a8b4207971eddc0`.
- Transferred the exact artifact, verified its hash remotely, installed under `/opt/recode/0.81.6`, and initially preserved `/opt/recode/0.81.5` plus wrapper, service and user-data inventory under `/opt/recode/rollback/20260802T105348Z-before-0.81.6-f287dff3a`.
- Atomically switched `/usr/local/bin/recode`, reinstalled Maestro's systemd user unit from the new package and reached authenticated active health. Version/help/model listing, embedded source identity, offline RPC `get_state`, offline Doctor, one read-only Maestro spawn/stop, rollback to `0.81.5` and rollforward to `0.81.6` passed.
- No provider/model generation request was made. A pre-existing foreground `0.81.5` process was initially preserved; after explicit Creator approval it terminated gracefully and `/opt/recode/0.81.5` was removed. The exact rollback artifact remains under `/opt/recode/artifacts` with SHA-256 `0abaed2ae364753e091a832cf981668fb6cd9fc67b37893784374bc151ddcee0`.
- Machine-readable evidence is retained at `Analyze/evidence/vps-0.81.6-f287dff3a-linux-x64.json` and `/opt/recode/certification/0.81.6-vps-linux-x64.json`.

## 2026-07-26 — Initial investigation

### Completed

- Identified the customized coding-agent package as `@reitaard/repi-coding-agent` version `0.81.4` with binary name `recode`.
- Located the existing self-update implementation.
- Confirmed that update discovery currently queries `https://pi.dev/api/latest-version`.
- Confirmed the endpoint currently advertises upstream `@earendil-works/pi-coding-agent` version `0.82.1`.
- Confirmed the upstream package exposes `pi`, not `recode`.
- Confirmed the active global package path is symlinked to this checkout's `packages/coding-agent` directory.
- Determined that the current package-manager update path could replace the linked fork package without updating this checkout.
- Located repository remotes in parent Git metadata:
  - origin: `reitaard/re.pi`
  - upstream: `earendil-works/pi`
- Detected a broken Git Bash linked-worktree boundary requiring investigation.
- Configured project-local GitHub MCP access in `.mcp.json`.
- Verified authenticated GitHub MCP connectivity and tool availability.

### Additional completed work

- Repaired the legacy OAuth worktree `.git` pointer without touching its generated-model changes.
- Established `repi/canonical` at published tag `repi-v0.82.1-r1` in the authoritative `re.pi` repository.
- Verified that the canonical release already contains the OpenAI OAuth provider and its metadata-precedence fixes; the remaining OAuth-only commits were temporary CI workflow churn.
- Added source-checkout detection using `repi/product.json` product identity.
- Added clean-branch, fork-tag, and fast-forward-only source update behavior.
- Preserved npm package-manager updates for non-source installations.
- Added regression coverage for source-root detection, fast-forward updates, branch preservation, dirty checkout refusal, detached checkout refusal, and divergence refusal.
- Regenerated the coding-agent shrinkwrap and install lock required by the canonical branch.
- Regenerated model catalogs through the approved generator to restore strict type checking.
- Focused updater tests pass: 9 tests across 3 files.
- Full `npm run check` passes.

### Next

- Commit and push the canonical updater changes.
- Build and smoke-test canonical Recode.
- Repoint the development `recode` symlink from the legacy OAuth worktree to the canonical checkout.
- Merge the canonical line into `agent-harness` after validation.

## 2026-07-26 — Three-way upstream planner

- Recorded exact Pi baseline `b4f293684bba718d59cc1157679bcf6157b3a7f5` (`v0.82.1`).
- Added explicit protected-path ownership under `repi/upstream-ownership.json`.
- Added read-only `recode upstream status|plan [target] [--json]` commands.
- Classified paths as custom-only, upstream-only, identical, protected, overlapping, or rename-review.
- Required a clean checkout and a target descended from the recorded baseline to prevent incomplete or misleading reports.
- Added unit and temporary-repository regression coverage proving no worktree mutation.
- Initial local `upstream/main` comparison on the incomplete 0.82 port reported 110 preserved custom-only files, 6 upstream-only candidates, and no overlaps against the then-recorded 0.82 baseline.

## 2026-07-26 — Custom-first pivot

- Visual testing proved the 0.82 canonical package omitted custom UI/runtime behavior; the global symlink was immediately restored.
- Preserved exact feature-complete source commit `c5ab200b`, which includes `agent-harness` plus later durable teach/session and OpenAI OAuth work.
- Aborted an experimental raw merge after detecting a fork/upstream tag-baseline collision; no conflict resolution or source loss occurred.
- Established `repi/preserve-custom` from exact `c5ab200b` and removed only assistant-created build artifacts.
- Recorded exact common Pi baseline `1f9e846c84f7d53356e7904e53f67b479d6f9c86` for read-only upstream classification.
- Added fail-closed package identity checks so `recode update` cannot replace `@reitaard/repi-coding-agent` with upstream Pi.
- Added read-only `recode upstream status|plan [target] [--json]` to the feature-complete line.
- Recorded historical session `019f9cc2-c15d-7b26-8fdb-5865e17273ee` and deferred worker restructuring until after release stability.
- Added a self-contained local packer that stages a Git-derived top-level version and bundles exact custom AI, Agent, TUI, and runtime dependencies.
- Built committed model catalogs offline so packaging did not rewrite generated source.
- Isolated artifact smoke tests passed for version, help, model listing, upstream planning, and selected custom runtime hashes.
- Verified complete packaged Coding Agent, TUI, Agent, and AI runtime trees against built source; only npm-excluded `.gitignore` files differed.
- Installed normal global package `@reitaard/repi-coding-agent@0.81.4-repi.2.dev.7.d9e9359f`; global path is no longer a package symlink.
- Verified the final global runtime trees exactly match the custom build.
- Verified live `recode update --self` refuses `@earendil-works/pi-coding-agent` and exits cleanly with status 1.
- Final artifact SHA-256: `8408643910b3a1841d5a100239eb095047eb5c6487a0a0f864d731e12e67dbae`.

## 2026-07-26 — Worker capability follow-up

- Confirmed multiple persistent conversations can use the same named worker identity.
- Added `worker_start_many` to launch two to eight independent conversations concurrently in one tool call.
- Added Levi's bounded `git_read` capability with a strict read-only subcommand allowlist.
- Blocked Git mutation commands, external execution/configuration flags, and parent traversal.
- Added explicit alternate workspace selection restricted to worktrees sharing the active Git common directory.
- Preserved Mayuri's librarian specialization and strengthened Levi's Git-evidence audit prompt.
- Focused worker tests pass, including simultaneous running-state proof and sibling/unrelated worktree boundaries.
- Installed final worker-capable package `0.81.4-repi.2.dev.9.b4b58fc9` from source commit `b4b58fc949c3d800ce4e29aca9f905c8b3556bb9`.
- Verified the installed worker-capable Coding Agent, TUI, Agent, and AI trees exactly match the custom build.
- Final worker-capable artifact SHA-256: `b15220d1a5975d06dbeede5350503bca633c121cc1e519633cf0caa6720d956a`.

## 2026-07-26 — Worker presentation and module boundary

- Restored `worker_start_many` batch count, per-worker identity/color/activity, progress text, timing, and separate handoff cards.
- Committed and pushed the presentation fix at `c1fd1121`; installed staged package `0.81.4-repi.2.dev.11.c1fd1121` with SHA-256 `89584b63eb3bdb310a1f3683af08a725f914041ab8ebd217a20aac97db6bb964`.
- Moved Levi, Mayuri, and Shiori-owned code under dedicated worker folders while retaining generic delegation lifecycle machinery.
- Moved specialized tool construction into worker definitions through `createTools`.
- Fixed native/MSYS Windows sibling-worktree path normalization.
- Committed and pushed the structural boundary at `c6b4dd13`.

## 2026-07-26 — Shiori and independent slash-worker phase

- Registered Shiori as stable worker id `shiori` with private normal conversation, read-only local tools, and no Kioku write capability.
- Preserved the isolated schema-constrained Shiori reviewer and made it explicit through `/shiori review [path]`.
- Removed review dependence on Aizen's idle state while retaining the process-wide single-flight lock.
- Made slash tasks independent of Aizen's abort signal and delivered completed reports through hidden, explicitly untrusted Aizen handoff messages.
- Added equal eight-conversation global/per-worker defaults, atomic over-capacity batch rejection, unique same-worker activity widgets, `/worker status`, and scoped `/worker cancel <id>`.
- Focused validation currently passes: 61 tests across seven worker, memory, and Shiori files; full `npm run check` passed before the final cancellation/UI refinements and will be rerun at the phase boundary.
- A Levi dogfood audit could not start because the currently installed `c1fd1121` runtime still has the old MSYS workspace bug (`lstat 'C:\\c'`). The source fix is in `c6b4dd13`; no automatic retry or fallback audit was performed.
- Committed and pushed first-class Shiori and independent slash handoffs at `fbe4f5a2`.

## 2026-07-26 — Live footer and worker installation

- Confirmed from the active session JSONL that compaction succeeded while the footer reverted from `ctx ?` to stale pre-compaction `ctx 187k 50.2%`.
- Identified the mismatch: cumulative footer statistics read live session entries, but context estimation read AgentHarness state synchronized only at the outer turn boundary.
- Changed context estimation to use the live compaction-aware session branch after every persisted model/tool-loop step.
- Colored `R`, `W`, and `CH` cache statistics with the token/context accent color.
- Added regressions for immediate post-compaction unknown state, live post-compaction usage before outer-turn synchronization, and cache-stat colors.
- Committed and pushed the footer fix at `88ba9b4a`.
- Focused footer/compaction validation passed: 36 tests with 2 skipped; full `npm run check` and commit hooks passed.
- Packed and isolated-smoke-tested `0.81.4-repi.2.dev.14.88ba9b4a`; version, help, model listing, metadata, worker files, and all four custom runtime trees passed.
- Installed the package globally as a normal non-symlink npm package and verified `recode --version` plus Coding Agent, AI, Agent, and TUI tree parity.
- Artifact SHA-256: `c72252625f1a67349e1d2f9432540216a41bc0a8bfa4feaaa8a0c8d12b9b74f4`.
- npm could not remove one temporary old-package directory because the running Recode process holds the native clipboard module open. The active package installed successfully; the stale process must be restarted before testing and the temporary directory can be retired afterward.

## 2026-07-26 — Worker hardening and modal-session boundary

- Normalized worker Git paths and installed `0.81.4-repi.2.dev.16.89e8dc30` (SHA-256 `c6f8df3836f042ac07c85438443c95c71cc03f0d47402af09b1fb7a6c252a0e2`).
- Hardened shared capacity accounting, atomic batch preflight, one-shot cancellation, Shiori settings-listener cleanup, foreign update-notice suppression, and compact Levi/Mayuri activity text in committed tip `84a9fbdc`.
- Replaced worker private-chat root-session creation with the existing custom modal UI.
- Removed private-chat session renaming and Aizen abort-signal inheritance while preserving independent worker conversation ids, custom-entry restoration, scoped cancellation, and runtime-teardown cleanup.
- Clarified that `/shiori` opens private chat and `/shiori review` performs current-session memory review.
- Focused modal/memory validation passed: 23 tests across two files. Full `npm run check` passed.
- Inspected the existing orchestrator: it already owns multiple RPC child processes, persisted instance metadata, event streams, UI request routing, independent stop lifecycle, and spawn/list/status/stop/RPC protocols.
- Reviewed Codex, Claude Code, and Hermes Agent architecture. Added a minimal plan to harden the existing supervisor with attach/detach, bounded cancellation, atomic manifests, safe completion delivery, and optional worktree isolation rather than introducing another framework.
- Hermes evidence was reviewed at `NousResearch/hermes-agent` commit `339d968689a3b91c5f537d7198ff28abde32ab3b`; selected patterns are bounded async delegation, completion queues, cooperative cancellation, schema/prompt caching, conservative safe-tool parallelism, and optional worktrees.
- Committed and pushed the modal boundary and structural plan at `053dee25`.
- Packed and isolated-smoke-tested `0.81.4-repi.2.dev.18.053dee25`; version, help, model listing, source metadata, and packaged worker runtime parity passed.
- Installed the package globally and verified version, source commit, and built worker runtime parity.
- Artifact SHA-256: `a4fcf6fb980150f1164a5fd53b4bc8d4757af32f6041c46c848e4e00806c8b38`.
- npm left another locked old-package directory because this running process still holds the clipboard native module; installation itself succeeded.

## 2026-07-27 — Kioku retrieval audit

- Confirmed automatic recall arrives at the correct `before_agent_start` boundary but retrieved irrelevant memory for generic continuation prompts.
- Identified four causes: raw-prompt OR FTS, no automatic acceptance threshold, overlapping multi-fact chunks, and global-only recall caused by resuming the legacy OAuth-worktree session with no project memory.
- Found stale global facts claiming the package is still symlinked and that self-update can still replace Recode; no memory was silently deleted or rewritten.
- Changed canonical list memory chunking to one durable entry per chunk while retaining bounded overlapping chunks for prose documents.
- Added an index-version hash so existing documents rebuild under the new chunker after restart.
- Added conservative local automatic reranking: conversational stop-word removal, minimum term coverage, project preference, and a three-entry cap. Explicit search remains broad.
- Focused memory validation passed: 15 tests.
- Committed and pushed the retrieval fix at `48459331`.
- Packed and isolated-smoke-tested `0.81.4-repi.2.dev.21.48459331`; version, help, model listing, and packaged memory-runtime parity passed.
- Installed globally and verified source metadata plus built memory-runtime parity.
- Artifact SHA-256: `9e7a96aa0c1875acfb38a54aa28cb71707a42fbfdab3df3684c1a61f9d31b997`.

## 2026-07-27 — Durable operations and release direction

- Confirmed restart from the authoritative `re.pi` checkout: project Kioku now resolves to this repository and the entry-based reindex expanded indexed chunks from 35 to 61.
- With Creator approval, removed or replaced stale global symlink, unsafe-update, transient MCP 401, and obsolete integration-branch memories.
- Created concise project memories for checkout authority, update safety, modal-worker/orchestrator architecture, and cross-platform deployment.
- Added root `OPERATIONS.md` and linked it from `AGENTS.md` so future sessions have a single safety, packaging, architecture, memory, and deployment entry point.
- Recorded the accepted goal of one certified artifact set for npm/Node, Windows, Linux, Termux, the primary machine, work PC, and VPS.
- Audited existing release foundations. Binary and Termux builders plus checksummed GitHub release staging already exist; npm trusted publishing described in `AGENTS.md` is absent from the current workflow and remains a release blocker.
- Did not connect to or mutate the VPS. It remains a later explicitly authorized inventory and rollout phase.
- Strengthened automatic and explicit memory prompts so recalled content is treated as potentially stale evidence below current Creator instructions and verified state.
- Added shared read-only `kioku_search` to every worker through the directory's host-provided external-tool boundary; no write tool or Cardinal bypass was added.
- Changed delegation from environment opt-in to default-on with explicit `REPI_DELEGATION=0|false|no|off` opt-out, and added release certification coverage for that default.
- Focused memory and worker validation passed: 42 tests across three files; 14 additional AgentSession/runtime tests passed with 3 environment-gated skips.
- Committed shared worker memory/default delegation at `535afb7c` and durable operations/release documentation at `eae21614`.
- Packed and isolated-smoke-tested `0.81.4-repi.2.dev.24.eae21614`; version, help, model listing, source metadata, and compiled parity for delegation, worker directory, memory, modal chat, and updater guards passed.
- Installed the exact artifact globally and verified the same runtime parity.
- Artifact SHA-256: `913ddc4fc79955ef7a1b75c289724d196554966945217f3483ebd53ec8d8b077`.

## 2026-07-27 — Release certification and VPS rollout

- Creator paused structural supervisor work and explicitly authorized release-candidate construction plus VPS inventory/update.
- Confirmed clean pushed `repi/preserve-custom` commit `659d9fcd7ebc7dc963df79060e71a426c942d30d`, descended from `c5ab200b`.
- The first full local-release attempt passed `npm run check` but failed before tests because Windows `cmd.exe` cannot execute `./test.sh` directly.
- Corrected the cross-platform local-release runner to invoke `bash ./test.sh`; no release artifact from the failed attempt was accepted.
- A second full local-release attempt reached the complete suite and failed before packaging. Failures separated into current regressions plus Windows/environment assumptions.
- Fixed current regressions: service-based `noTools` no longer exposes default delegation tools, Aizen retry/queue continuations no longer recreate the session-control host on continuation `agent_start`, and stale Recode identity tests were updated.
- Focused validation passed: 101 tests across system prompt, Aizen runtime/profile, retry/queue, no-tools, memory, workers, and worker directory suites.
- Full `npm run check` passed after the fixes.
- Remaining unrestricted `test.sh` failures on this Windows host include symlink privilege, chmod/read-only semantics, path separators, timing, stale platform-specific expectations, and broader historical tests. They are not accepted as a green release gate, but they are now documented as separate release hardening work.
- Committed and pushed release-candidate fixes at `9e818840`.
- Packed, isolated-smoke-tested, and locally installed `0.81.4-repi.2.dev.27.9e818840` from source `9e818840f33478847e8cc5fb376b61f7fc5fd366`.
- Artifact SHA-256: `44773d6c6c72f4a32ee6eeed82fa779c285d5d122ac136c94bc64285f6c801fb`.
- VPS inventory found `vmi3286400` running Ubuntu Linux x64, Node `v20.20.2`, and `/usr/local/bin/recode -> /opt/repi/v0.81.4/recode` at version `0.81.4`.
- Transferred the exact certified tarball to the VPS and verified the same SHA-256 remotely.
- Installed private Node `v26.5.0` under `/opt/node-v26.5.0-linux-x64` after verifying Node's upstream SHA-256.
- Installed Recode under `/opt/recode/0.81.4-repi.2.dev.27.9e818840` without modifying `/root/.pi/agent` user data.
- Removed the old `/usr/local/bin/recode` symlink and replaced it with a regular wrapper file that executes the certified package through private Node 26.
- Verified VPS `recode --version`, `recode --help`, `recode --list-models`, package source metadata, private Node version, non-symlink command wrapper, and foreign-package update refusal.
- Preserved `/opt/repi/v0.81.4` and recorded the previous symlink target under `/opt/recode/rollback/recode-bin-before-0.81.4-repi.2.dev.27.9e818840.txt` for rollback.
- `/root/repi` was not present on the VPS; the source checkout is `/root/re.pi`, on branch `agent-harness`, with existing modified worker/delegation files and untracked `ops/`, `recodeupvps.sh`, and a backup file. It was treated as reference-only and was not used for the installed artifact.

## 2026-07-28 — Startup baseline and post-lifecycle comparison gate

- Completed S0 startup measurement instrumentation and the S1 representative baseline; detailed evidence is recorded in `Analyze/IMPLIMENT.md`.
- Established S2 release-grade package runtime architecture as the next implementation phase.
- Accepted a faithful Hermes lifecycle-contract port at exact commit `5b22bd955682a8fc7b07769784c5129e23f53eaf` through separate Recode worker and full-session adapters.
- Added a concrete post-lifecycle gate: after S2–S3 and O0–O8 pass, clone/freeze exact jcode and upstream Pi revisions, map behavioral test contracts, run native/translated conformance suites, and compare matched lifecycle performance endpoints.
- Kept the product checkpoint three-way—Recode, jcode and upstream Pi—with Hermes retained as lifecycle provenance.
- Deferred final startup SLO ratification and shared-service optimization ordering until that evidence exists.
- Began S2 with a versioned extension runtime contract, verified built-entry/hash loading and fail-closed tamper/compatibility handling.
- Classified `repi-browser` as a required first-party certified package and the first controlled migration target despite its private status; public redistribution remains blocked on explicit licensing.
- Completed the local controlled browser-package path: bundled ESM artifact, source map, exact hash, compatibility/declarative lifecycle metadata, fail-closed host verification and successful browser-tool registration.
- Updated installed web/MCP packages and exact upstream Pi compatibility runtimes after the configured probe exposed a broken `pi-web-access` `./compat` import; all configured extension tools now register without errors.
- Completed S2 and pushed private browser artifact commit `6105993645f3578bf989393704bcc97c0e06e156` to `origin/s2-runtime-contract`; global Recode settings pin the verified remote commit.
- Post-S2 warm medians: configured RPC 3,761.5 ms, configured TUI input 4,264.9 ms, isolated RPC 1,521.3 ms, isolated TUI input 1,723.7 ms. All stayed inside the 10% regression guard.
- Completed S3: added lifecycle readiness state/generations, exposed it through RPC, and separated session/model/frame/input readiness from integration completion. Configured warm medians measured input echo at 4,221.6 ms and integration readiness at 4,266.6 ms.
- Accepted D-016: Recode Maestro is the full-session conductor; CLI contract is `recode maestro`, explicit `recode aizen`, and direct worker command/aliases without an extra Aizen model turn.
- Completed O0 source/Hermes mapping and four focused characterization tests. Upstream server contributes no lifecycle fix; Phase 4A routing is deferred. Corrected Node RPC-entry resolution from incompatible `createRequire().resolve()` to ESM resolution.
- Completed O1 public Maestro lifecycle contract and private worker/full-session adapters with bounded records, fail-closed capabilities, lifecycle transitions, cancellation-safe acquisition, terminal retention, stale-owner generations and process identity validation. O1 lifecycle tests passed 10/10; all orchestrator tests passed 14/14.
- Replaced the removed `--aizen` flag with explicit `recode aizen` parsing under D-016; argument tests passed 74/74.
- Completed O2 atomic validated manifests, last-known-good backup recovery, observable corruption diagnostics, process-start identity checks and non-lossy terminal retention. O2 tests passed 7/7; all orchestrator tests passed 21/21.
- Completed O3 bounded RPC deadlines, cooperative command/instance cancellation, stale-ID/owner rejection, workload limits, SIGTERM-to-SIGKILL escalation and persisted verified termination outcomes. All orchestrator tests passed 29/29.
- Rechecked O1–O3 against frozen local Hermes `5b22bd955682a8fc7b07769784c5129e23f53eaf`; retained mapped invariants and necessary Recode process adapters, deferred later-phase gateway concerns, and removed the obsolete lossy instance-deletion helper.
- Completed O4 fail-closed durable-session turn leases with FIFO alias serialization, generation-safe release, compaction/session rotation rebind and supervisor integration through `agent_settled`. All orchestrator tests passed 37/37.
- Completed O5 exclusive interactive ownership, concurrent read-only attachment, non-destructive detach, durable waiting-input replay, bounded event tails and receipt-verified restart reconnect. Frozen Hermes gateway restart behavior was rechecked and intentionally not ported because it does not map to Recode child-session attachment. All orchestrator tests passed 41/41.
- Completed O6 with a bounded durable completion ledger, generation-safe claims, same-owner restart reclaim, idempotent acknowledgement, safe-boundary supervisor delivery and one persisted explicitly untrusted Aizen context handoff per delivery ID. Coding-agent handoff tests passed 3/3; all orchestrator tests passed 45/45; `npm run check` passed.
- Kept Telegram outside the core critical path. O7 remained workspace safety; O8 owns Windows/Linux core service supervision and TUI integration under option A child-termination semantics.
- Completed O7 canonical unmanaged workspace receipts, read-only no-tool process admission, mutating reader-RPC rejection, exclusive write-worktree ownership, verified sibling-worktree admission and workspace-verified restart reconnect. All orchestrator tests passed 50/50; `npm run check` and `git diff --check` passed.
- Accepted D-017: Maestro records workspace ownership but never creates, mutates, cleans or removes worktrees; ambiguous ownership and reconnect fail closed.
- Completed O8 with verified single-owner health/restart receipts, systemd cgroup and Windows Job Object containment, bounded option A shutdown, explicit degraded-adapter state, the `recode maestro` service surface, a live-session control board, non-blocking Aizen footer health, VS Code-safe configurable dequeue fallback, and Node/Bun distribution wiring. The Windows manual service path passed an end-to-end ready/health/planned-stop smoke test; all orchestrator tests passed 57/57 and focused coding-agent O6/O8 tests passed 12/12.

## 2026-07-29 — Whole-product production review

- Reviewed Recode as one product rather than treating Maestro as the complete scope, covering Aizen, workers, lifecycle, tools/integrations, memory, security, TUI/clients, providers, updates, release and deployment.
- Cross-checked O0–O8 against frozen Hermes `5b22bd955682a8fc7b07769784c5129e23f53eaf` and found two production integration gaps behind passing component tests: the lifecycle service/adapters are not instantiated by production code, and normal supervisor terminal transitions do not call `enqueueCompletion()`.
- Confirmed the deferred Hermes iteration-budget invariant remains absent from the production agent/supervisor integration.
- Inspected the public READMEs for Codex, Claude Code, OpenCode, goose and Aider as product-positioning evidence only; no external implementation was adopted.
- Added `Analyze/PRODUCTION-ROADMAP.md` with V1 single-machine production safety, V2 efficient multi-session/fleet operation and V3 multi-channel/ecosystem gates.
- Reopened O1 production integration and O6 producer integration in `Analyze/PLAN.md`; O8 remains component-complete but requires Windows/Linux release certification.
- Kept Telegram and broad jcode benchmarking outside the V1 critical path.

## 2026-07-29 — V1 lifecycle closure

- Updated repository authority: `agent-harness` is the active development branch; `repi/preserve-custom` remains a historical release-line reference.
- Integrated `MaestroLifecycleService` and `MaestroFullSessionLifecycleAdapter` into the real full-session spawn, cancel, attachment, waiting-input, result and stop path over the existing supervisor backend.
- Added real Windows/Linux RPC child process-start identity capture before lifecycle `RUNNING` admission.
- Added independent provider-call iteration budgets with race-safe consume/refund behavior: 500 calls per Aizen run and 50 per named-worker/Shiori run.
- Wired actual child terminal transitions into O6 and persisted terminal state, bounded summary, deterministic result hash and completion-outbox marker in the atomic instance manifest.
- Added idempotent recovery for service crashes before completion enqueue and after queue persistence but before the instance outbox marker.
- Added lifecycle/attachment synchronization for `WAITING_INPUT` and `RUNNING`.
- Real isolated RPC child smoke passed lifecycle `RUNNING -> CANCELLED` with a verified process identity.
- Validation passed: all orchestrator tests **59/59**, focused Agent loop/budget tests **23/23**, focused Aizen/worker tests **36/36**, and `npm run check`.
- O1–O6 are production-integrated and complete under the accepted local lifecycle contract. Local IPC security and release certification remain separate next-phase decisions.

## 2026-07-29 — Local control-plane security

- Added a private 256-bit Maestro IPC token and authenticated every request and stream handshake before dispatch.
- Added private Unix directory/file/socket checks and explicit no-all-user Windows named-pipe flags; documented same-user processes as remaining inside the trust boundary.
- Replaced complete service-environment inheritance with a reviewed runtime/provider allowlist and explicit `REPI_MAESTRO_CHILD_ENV_ALLOW` exceptions.
- Removed raw child stderr from control-plane errors and retained only byte-count plus truncated SHA-256 diagnostics.
- Rejected detached mutating RPC commands unless they carry the current interactive owner generation.
- Added deterministic denial for catastrophic recursive root/home/credential-store targets, path-traversal variants, raw devices, disk formatting and fork bombs; Recode remains explicitly non-sandboxed.
- Real isolated RPC child lifecycle smoke continued to pass after environment filtering.
- Validation passed: all orchestrator tests **63/63**, catastrophic-command tests **18/18**, relevant bash/Aizen tests, `npm run check`, and `git diff --check`.
- Release identity, updater completion and Windows/Linux artifact/service certification are now the next bounded phase.

## 2026-07-29 — V2 release identity and manifest foundation

- Accepted `@reitaard/repi-coding-agent@0.81.5` as the next stable compatibility target. Stable SemVer will not contain development distance or a source-commit suffix; publication remains deferred.
- Added one shared fail-closed release identity gate for local packaging, custom packing, Bun binaries, Termux, npm publication, the release/tag script and GitHub release staging.
- Required clean authoritative `agent-harness` source for development packaging, exact custom-baseline ancestry, lockstep expected package identities, or an exact `vX.Y.Z` tag matching both HEAD and package version for release artifacts.
- Removed the workflow's independent `source_ref` recovery input so one release tag cannot label artifacts built from another source.
- Corrected the release script to push the validated authoritative branch instead of unrelated `main`, reject pre-existing target tags and reverify the created tag before any push.
- Added deterministic embedded `recode-release.json` provenance for npm, binary, Termux and source artifacts plus detached `recode-artifacts.json` size/SHA-256 indexing and `SHA256SUMS` coverage.
- Closed a review-discovered stale-output provenance gap: tagged binaries cannot skip builds, direct custom/npm packaging performs a clean build, and source identity is rechecked after builds before manifests or publication.
- A clean-clone canary attempt correctly stopped when the ordinary AI build refreshed live model catalogs. Added an offline release build that compiles the committed catalogs without source drift; all packaging paths now use it.
- Required the artifact verifier to match the exact filename set declared by the release manifest, reject duplicates and validate manifest binding, sizes and hashes.
- Normalized binary archive ordering, timestamps, ownership metadata and ZIP metadata where practical.
- Disabled self-update discovery in the shipped CLI until a Recode-owned endpoint and manifest-verification path are built in. Extension updates remain independent; controlled tests retain endpoint injection and foreign package identities remain rejected before mutation.
- Focused validation passed: release identity/manifest/index tests **10/10**, version-check tests **8/8**, package-command tests **24/24**, shell syntax checks, `npm run check`, and `git diff --check`.
- Repaired two Windows-only historical package-command expectations exposed by the release gate: platform-native extension path separators and realistic pnpm store-layout fallback for shim detection.

## 2026-07-30 — V1 release and control-plane qualification

- Built and isolated-smoke-tested `@reitaard/repi-coding-agent@0.81.5` from exact source `98bcccfe6477af8795ece5835dba75fbebcc7f50`; artifact SHA-256 is `0abaed2ae364753e091a832cf981668fb6cd9fc67b37893784374bc151ddcee0`.
- Verified version, help, model listing, embedded release identity and configured RPC startup from the staged package.
- Replaced fragile Windows release-root path round-tripping with a Git root-prefix invariant.
- Added one fail-closed Maestro lifecycle projection across IPC, service health and dashboard state, plus an offline redacted diagnostic bundle.
- Confirmed the existing detached mutation gate already requires the current interactive owner generation for every write-capable RPC operation.
- Added explicit installation classification, interactive/non-interactive approval semantics and an atomic pre-mutation rollback receipt; self-update discovery remains disabled.
- Focused policy/projection/dashboard checks and `npm run check` passed.
- With explicit Creator authorization, inventoried `root@157.173.127.84` (`vmi3286400`) and preserved the existing wrapper/version as rollback evidence without touching `/root/.pi/agent`.
- Transferred the exact `0.81.5` artifact, verified matching SHA-256, installed it under `/opt/recode/0.81.5`, and atomically moved `/usr/local/bin/recode` to the new runtime.
- Linux x64 Node certification passed version, help, model listing, embedded source identity, configured RPC startup, one real prompt, systemd-user Maestro readiness, a read-only Maestro session, Telegram gateway restart, self-update refusal, rollback to the prior runtime, and rollforward to `0.81.5`.
- Maestro and Telegram services are active. Machine-readable evidence is retained at `/opt/recode/certification/0.81.5-vps-linux-x64.json`; the exact artifact remains under `/opt/recode/artifacts`.
- The certified `98bcccfe6` artifact predates the later local diagnostic/state-projection changes, so those changes were not falsely included in its VPS certification and require the next exact package checkpoint.
- Froze the exact product checkpoint at jcode `v0.54.4` (`fb7a5ea5`, official Windows x64 SHA-256 `2572765b72f776ef4bfdd41efc055e0078910d60aae600aa35c6b1fcb5f54523`) and upstream Pi `c820aa26`; refreshed the full feature/user-experience comparison in `analyze/COMPARE.md`.
- Rejected an invalid jcode cold-server number after its command held through the 120-second probe deadline; retained only bounded warm daemon-control observations and did not ratio-compare unmatched endpoints.
- A Windows ten-session probe exposed two concrete Recode UX defects before measurement: the scheduled-task service opened a visible console, and a cold spawn exceeded the five-second client deadline while still creating an online child. Added hidden Windows service startup and operation-specific IPC deadlines.
- After the next PC restart, Task Scheduler launched Maestro immediately but the runtime stopped about 11 seconds later with a persisted planned-stop classification; subsequent health failed because the pipe was absent. The visible installed host and likely console closure remain the leading explanation, but fast task launch was not misreported as durable service readiness.
- Hardened native install/start/restart to wait for authenticated ready health, stop an older runtime before replacement, expose verified running/stopped/unexpected-exit status, and classify unexpected native-supervision signals as crashes. An isolated source smoke reached ready in 2,073.6 ms and shut down cleanly.
- Committed the readiness boundary at `5d37b556c7fb4ee2a651639d9be8b804dd781ee2`, built clean stable package `@reitaard/repi-coding-agent@0.81.5`, and retained artifact SHA-256 `4cb7ded10c1dc955cf9305640bdf2bcedf375e067089d12c7f55d6f0656a6e24` under the local temporary artifact directory.
- Rejected the first development-suffix package after its prerelease version correctly failed the extensions' stable `>=0.81.5 <0.82.0` runtime contract. Repacked with clean `0.81.5`, matching the embedded release manifest and project SemVer policy.
- After the Creator restarted Recode to release the Windows clipboard DLL, the exact stable tarball completed a clean global npm installation in 478 ms. Version and source metadata match `0.81.5` and `5d37b556c`.
- The hidden scheduled task reached authenticated ready health, remained `Running`, and a read-only full session reached lifecycle `RUNNING` in 9,210 ms without the former false five-second timeout. The temporary child was stopped cleanly. One reboot/logon persistence check remains pending.

## 2026-08-02 — V2 phase boundary and Maestro entry UX

- Froze deeper Doctor expansion after the generic read-only package/capability discovery checkpoint; exact-artifact packaging remains V2-A closure.
- Reorganized near-term V2 into four explicit phases before memory work: Doctor certification, direct Maestro entry, matched startup/session measurements, and measurement-justified non-memory O9 sharing.
- Added direct Maestro attachment by unambiguous full/partial id or label, bounded search across ids, labels, workspaces and branches, and prefiltered TUI entry without creating another runtime.
- Added focused selector ambiguity, missing-session, workspace search and automatic-attach coverage.
- Preserved startup and cold-start comparison as a first-class V2-C requirement, including service cold start, warm attach and one/ten-session evidence at matched endpoints.
- Added a secret-safe dirty-worktree fingerprint to startup artifacts so measurements from an uncommitted checkout cannot be mistaken for an exact clean source result.
- Stopped the plan before automatic memory retrieval, semantic reranking/embeddings or shared Kioku indexes pending Creator review.
- Committed the Doctor/Maestro entry checkpoint at `4dbfbb690`, the benchmark output-identity correction at `79b9855c6`, and the isolated Maestro benchmark harness at `ad85afd1a`.
- Retained clean-source uncontrolled-cache V2-C startup evidence: configured RPC median 3,446.5 ms, configured TUI input echo 3,307.3 ms, isolated RPC 1,450.3 ms and isolated TUI input echo 1,500.6 ms.
- Configured RPC extension loading measured 1,988 ms median, led by Browser/OpenClaw entry 720 ms, Open Provider factory 654 ms, web-access 439 ms and MCP adapter 192 ms. No optimization decision is inferred from one baseline.
- The isolated Maestro service reached authenticated ready in 2,059.7 ms, one read-only session spawned in 3,620.0 ms, and warm interactive attach completed in 2.2 ms; warm control requests measured 1.0 ms median.
- The ten-session gate exposed a real capacity boundary: production admitted eight sessions and rejected the ninth with `Maestro live instance limit reached`. The benchmark preserved the bound rather than weakening it to manufacture a ten-session result.
- No paid provider request, destructive cache clearing, active-session stop, installed-product mutation or remote operation was performed.
- Extended the isolated harness with cross-platform process-tree RSS sampling at clean commit `b6050d665`; the Windows service plus one configured read-only session used 539,320,320 aggregate working-set bytes across three processes, while the service plus maximum-admitted eight sessions used 3,546,009,600 bytes across ten processes.
- The resource-enabled repeat measured service readiness at 1,802.3 ms, one-session spawn at 3,845.6 ms and warm attach at 1.7 ms. These Windows RSS values are not presented as Linux PSS or topology-neutral jcode comparisons.
- A second clean-source repeat at `76f1c768d` added executable/depth attribution without command lines or paths: one session measured 533,008,384 bytes; eight measured 3,505,524,736 bytes. The eight depth-1 session Node processes each used roughly 300–458 MiB while the depth-0 Maestro service used roughly 136 MiB, confirming substantial process-local duplication without yet proving which allocations can be shared safely.
- Raised the bounded default Maestro capacity to ten at `0589128e2`; an isolated clean-source run admitted all ten sessions and measured 3,838,095,360 aggregate Windows working-set bytes across the service, ten session children and console host.
- Reused the retained exact jcode `v0.54.4` checkpoint instead of treating an interrupted duplicate download as new evidence. Prior valid observations remain warm daemon-control only; its 120-second held cold-start command remains rejected.
- Selected lockstep `0.81.6` for the next local Windows x64 certification binary so it cannot be confused with previously installed `0.81.5` artifacts. This is a local build checkpoint, not publication or remote-rollout authorization.
