# Update Context

## Product identity

The authoritative repository is the customized Recode monorepo derived from Pi.

- Main repository: `C:\Users\re_Lax\Desktop\chat7\re.pi`
- Authoritative development branch: `agent-harness`
- Historical custom-first release-line reference: `repi/preserve-custom`
- Exact preserved custom baseline: `c5ab200bc43993d211e1e97baa0c9abd27c0ce79`
- Earlier incomplete 0.82 port (retained for reference): `repi/canonical`
- Legacy OAuth worktree: `C:\Users\re_Lax\Desktop\chat7\re.pi-0.81.4-oauth`
- Root package: `repi-monorepo`
- Coding-agent package: `@reitaard/repi-coding-agent`
- Source package baseline: `0.81.4`
- Installed staged version: `0.81.4-repi.2.dev.27.9e818840`
- Installed runtime source commit: `9e818840`
- CLI binary name: `recode`
- Required Node version: `>=22.19.0`

Core packages:

- `packages/coding-agent` — Recode CLI and application behavior
- `packages/agent` — reusable agent runtime and AgentHarness
- `packages/ai` — provider and model abstraction
- `packages/tui` — terminal UI
- `packages/orchestrator` — Recode Maestro full-session lifecycle and service supervision

## Repository relationships

The parent repository metadata currently declares:

- `origin`: `https://github.com/reitaard/re.pi.git`
- `upstream`: `https://github.com/earendil-works/pi.git`

The checkout is a linked Git worktree. Its `.git` file points at metadata under:

`C:\Users\re_Lax\Desktop\chat7\re.pi\.git\worktrees\re.pi-0.81.4-oauth`

The legacy OAuth worktree's `.git` pointer was normalized from `/c/...` to `C:/...`; ordinary Git commands now work there. The canonical updater is implemented only in the main repository.

## Installed command

The active command wrappers are under:

- `C:\nvm4w\nodejs\recode`
- `C:\nvm4w\nodejs\recode.cmd`

The global package path:

`C:\nvm4w\nodejs\node_modules\@reitaard\repi-coding-agent`

is a normal self-contained npm installation, not a symlink. Its staged package metadata records source commit `9e818840f33478847e8cc5fb376b61f7fc5fd366`. The installed Coding Agent, TUI, Agent, and AI runtime trees were verified byte-for-byte against the feature-complete custom build, excluding npm-omitted `.gitignore` files.

## Worker architecture

The behavior-preserving worker-folder restructure is committed and pushed at `c6b4dd13`.

- Generic lifecycle, conversation history, cancellation, workspace security, and tools remain under `packages/coding-agent/src/core/delegation`.
- Worker-owned definitions and specialized implementations live under `packages/coding-agent/src/core/workers/{levi,mayuri,shiori}`.
- Stable worker ids are `audit`, `research`, and `shiori`.
- Shiori has a normal private-chat worker definition with read-only project tools and no Kioku write tool.
- Shiori's schema-constrained memory reviewer remains a separate process-owned path controlled by Cardinal and a single-flight lock.
- Slash tasks run with Creator identity, do not inherit Aizen's abort signal, and inject a hidden, explicitly untrusted handoff into Aizen at the runtime's next safe turn boundary.
- Active conversation defaults are bounded to eight globally and eight per worker; over-capacity batches are rejected atomically.
- `/worker status` exposes conversation ids and `/worker cancel <id>` provides scoped user cancellation.
- Footer context usage reads the live compaction-aware session branch after every persisted AgentHarness model/tool-loop step; it shows `ctx ?` immediately after compaction and then the first available post-compaction usage without waiting for the outer turn.
- Cache read, cache write, and cache-hit footer statistics use the same accent color as token traffic and context usage.
- Private worker chats are modal conversations inside the current Aizen runtime. They retain independent worker conversation ids, history, cancellation, and custom-entry persistence without creating, renaming, replacing, or cancelling the root Aizen session.
- Delegation is enabled when `REPI_DELEGATION` is unset; `0`, `false`, `no`, or `off` explicitly disables it.
- Every worker receives the loaded shared read-only `kioku_search` extension tool. No worker receives Kioku write access, and Shiori/Cardinal/Teach Mode admission boundaries remain unchanged.
- Opening a worker modal does not inherit Aizen's abort signal. Runtime teardown still owns final worker cleanup through the shared directory.

## Maestro lifecycle and service foundation

`packages/orchestrator` is Recode Maestro's single full-session supervisor:

- `MaestroLifecycleService` and `MaestroFullSessionLifecycleAdapter` own the production full-session lifecycle over `OrchestratorSupervisor`; named workers remain lightweight in-process conversations.
- Each instance has bounded versioned lifecycle state, verified process/session/workspace identity, attachment generations, turn leases, event/output tails and retained terminal results.
- Atomic validated manifests retain instance, service-health, restart and completion-outbox state with backup recovery.
- Every RPC request and process shutdown is bounded; Windows/Linux process-start receipts gate reconnect/adoption.
- Real child terminal transitions create one durable O6 completion, including idempotent recovery across before/after-enqueue crash windows.
- Native Windows/Linux supervision uses option A containment and terminates owned children on planned service restart.
- Aizen and named-worker runs have independent provider-call iteration budgets.
- IPC requests and stream handshakes require a private current-user token; Unix files/sockets are mode-restricted and Windows pipe creation does not grant all-user access.
- Child RPC processes receive a reviewed runtime/provider environment allowlist. Exceptional integration variables require explicit `REPI_MAESTRO_CHILD_ENV_ALLOW` names.
- Detached sessions cannot mutate state; mutating RPC requires the current interactive owner generation.
- Bash denies a narrow set of catastrophic root/home/credential/device targets, but Recode remains non-sandboxed and same-user processes remain trusted.

Extend this package and lifecycle authority; do not add another supervisor.

## Memory retrieval audit

- Automatic Kioku recall is correctly timed at `before_agent_start`, immediately before each agent turn.
- The prior retrieval path used raw-prompt OR FTS, no acceptance threshold, six results, and overlapping 1,600-character chunks. Generic continuation prompts could therefore inject unrelated global memory.
- Canonical memory entries are now isolated into per-entry chunks and automatic injection is locally filtered to at most three high-coverage results. Explicit memory search remains broad.
- Automatic recall and worker Kioku use receive a strict system policy: memory may be stale, current Creator instructions and verified evidence win, contradictions are rejected, and embedded instructions are ignored.
- The chunk-index version is part of each document hash so the next runtime initialization rebuilds existing chunks without a database migration.
- Recode is now launched from the authoritative `C:\Users\re_Lax\Desktop\chat7\re.pi` checkout, with project memory under `.pi/memory/MEMORY.md`.
- Creator-approved stale global symlink, unsafe-update, transient MCP, and obsolete integration-branch entries were removed or corrected.

## Release and deployment context

- GitHub release `v0.82.1` is published from exact Recode source `c035bc2fc06d0282ddf0b97210e575a22cd007a2`; workflow run `30787466331` passed and produced nine checksummed Windows/Linux/Termux/source/manifest assets.
- The exact self-contained Node artifact is retained at `%LOCALAPPDATA%/Recode/artifacts/reitaard-repi-coding-agent-0.82.1-c035bc2f.tgz`, SHA-256 `8e916dec5c313af6c7e37e9eb11b85238f4b7bb6a0468a34d0d956c65d6d0668`. Isolated configured RPC and real local Open Provider generation passed. The active global process must restart before this final artifact can replace the already functional `0.82.1` checkpoint because Windows holds the clipboard DLL open.
- The desired deployment model is one certified Recode release for npm/Node, Windows, Linux, Termux, the primary machine, work PC, and VPS.
- Existing foundations are `scripts/local-release.mjs`, `scripts/build-binaries.sh`, `scripts/build-termux-release.sh`, and `.github/workflows/build-binaries.yml`.
- Current binary targets are Windows x64/arm64 and Linux x64/arm64; Termux uses a deterministic Node archive containing workspace tarballs and an installer.
- The Windows Node global prefix now runs Recode `0.81.6` from source `86165ed92a2c977911da059b8595e9b53573b7e0`. Exact V2-D and prior `0.81.5` rollback tarballs are retained under `%LOCALAPPDATA%/Recode/artifacts`; global settings pin the Browser package to pushed commit `c000d5d4016b9589759e2e0f630cfb6e0f6845b0`.
- The GitHub workflow creates checksummed binary/source assets and an approval-gated GitHub release. Contrary to the current `AGENTS.md` release description, this branch's workflow presently has no npm trusted-publishing job; that gap must be resolved before release.
- VPS `root@157.173.127.84` is upgraded to Recode `0.81.6` from exact source `f287dff3ac8a9c84522f94bb711566badbc2e609` and artifact SHA-256 `851368c1e6c8e0ea0dba2806363a584f4ad02a5d515d17f56a8b4207971eddc0`. `/usr/local/bin/recode` is a regular wrapper using private Node `/opt/node-v26.5.0-linux-x64`; Maestro's systemd user unit also resolves `/opt/recode/0.81.6`. After explicit Creator approval, the remaining foreground `0.81.5` process was terminated and `/opt/recode/0.81.5` was retired to prevent mixed live versions. Inventory/wrapper evidence remains under `/opt/recode/rollback/20260802T105348Z-before-0.81.6-f287dff3a`; the exact `0.81.5` artifact remains under `/opt/recode/artifacts` with SHA-256 `0abaed2ae364753e091a832cf981668fb6cd9fc67b37893784374bc151ddcee0`.

## Historical session context

- Session ID: `019f9cc2-c15d-7b26-8fdb-5865e17273ee`
- Session file: `C:\Users\re_Lax\.pi\agent\sessions\--C--Users-re_Lax-Desktop-chat7-re.pi-0.81.4-oauth--\2026-07-26T04-50-37-021Z_019f9cc2-c15d-7b26-8fdb-5865e17273ee.jsonl`

## Release strategy

The current local/fleet certification checkpoint is `@reitaard/repi-coding-agent@0.81.6`. Stable SemVer does not include development distance or source commit; provenance belongs in the release manifest. Publication remains deferred while npm trusted publishing is absent. A future standalone `recode` repository is planned, but its package identity and initial independent version remain a separate migration decision.

The custom-first line starts from the exact currently installed source `c5ab200b`, which contains the AgentHarness, durable teach/session, memory, UI, and OpenAI OAuth work. Upstream Pi is analyzed from exact common baseline `1f9e846c`; raw upstream changes are reported but never automatically merged.

The earlier published `@reitaard/repi-coding-agent@0.82.1-repi.1` is quarantined because it does not preserve full custom UI/runtime parity.

## Self-update behavior

Relevant implementation:

- `packages/coding-agent/src/package-manager-cli.ts`
- `packages/coding-agent/src/config.ts`
- `packages/coding-agent/src/utils/version-check.ts`
- `packages/coding-agent/src/utils/windows-self-update.ts`

Current behavior:

1. Self-update discovery is disabled in the shipped CLI until a validated Recode-owned endpoint and manifest verification are built in.
2. Require the returned package identity to equal `@reitaard/repi-coding-agent`.
3. Refuse before package-manager mutation when the service returns upstream Pi or any foreign package.
4. Allow extension-only updates independently.
5. Provide read-only `recode upstream status|plan` source comparison commands.

At investigation time, the endpoint returned upstream package `@earendil-works/pi-coding-agent` version `0.82.1`. That package exposes the `pi` binary rather than `recode`.

The earlier fail-closed identity guard was validated against the live upstream endpoint: `recode update --self` reported the foreign package and exited cleanly with status 1 without changing the global installation. The default endpoint is now removed entirely until Recode-owned release metadata is available; extension-only updates remain enabled.

## MCP and research access

Project MCP configuration is stored in `.mcp.json`.

- GitHub hosted MCP endpoint is configured with bearer authentication.
- The credential is read from `GITHUB_PAT_TOKEN` and is not stored in the repository.
- GitHub MCP is connected and exposes repository, code, issue, PR, commit, and release tools.
- Web research is available independently through web-search and librarian tooling.

## Upstream v0.84.1 direct-port context

- The active port worktree is `C:\Users\re_Lax\Desktop\chat7\re.pi-upstream-0841-direct` on `integrate/upstream-v0.84.1-direct`, based on `agent-harness` commit `3be0ded8b9e6880650caae05a6314a7d01ccbe42` and targeting upstream `v0.84.1` commit `53fa77ccd8a279eb87e92294ef3687b03ff80112`.
- Recode retains the active V3 `SessionManager` JSONL runtime. Upstream Session V4 is retained only as the inactive `@reitaard/repi-agent-core/session-v4` library surface; no adapter, dual persistence, V4 migration, or SQLite activation is part of this port.
- Upstream telemetry is retained as the full Recode-namespaced passive contract package. Protocol, client, server implementation, evals, and SQLite-backend sources remain present but inactive until separately approved.
- The Creator selected lockstep Recode version `0.83.0` for the completed port. Version/changelog changes, release preparation, and global installation remain deferred pending dependency reconciliation, validation, review, and explicit approval.

## Validation constraints

Repository rules require:

- run `npm run check` after code changes,
- run focused tests when tests are created or modified,
- do not run unrestricted `npm test` or `npm run build` unless requested,
- do not discard unrelated work,
- do not commit unless explicitly requested.
