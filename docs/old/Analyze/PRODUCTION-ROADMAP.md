# Recode production roadmap — V1 to V3

**Review date:** 2026-07-29
**Recode checkpoint:** `21cd84eb311d0e147895969b9b2289875910f6a4` on `agent-harness`
**Hermes checkpoint:** `5b22bd955682a8fc7b07769784c5129e23f53eaf`

## Scope

This is a whole-product roadmap for Recode, not a Maestro-only plan. It covers:

- Aizen and the agent loop;
- named workers and delegation;
- Maestro lifecycle and service supervision;
- coding tools, LSP, MCP, browser, extensions and package activation;
- project trust, permissions, credentials and unattended execution;
- Kioku, Teach Mode and Cardinal;
- TUI, CLI, SDK, RPC and future channels;
- providers, authentication and model readiness;
- installation, updates, releases, diagnostics, rollback and deployment.

O0–O8 are subsystem checkpoints. Passing their focused tests does not by itself make the complete Recode product production-ready.

## Evidence policy

This review uses current Recode source and tests, the frozen Hermes source checkpoint, prior jcode source inspection, and a small public-product README sample. README claims are product-positioning evidence only; they are not treated as verified implementation or performance evidence.

Public READMEs inspected on 2026-07-29 without using their source as a porting baseline:

- [OpenAI Codex](https://github.com/openai/codex)
- [Anthropic Claude Code](https://github.com/anthropics/claude-code)
- [OpenCode](https://github.com/anomalyco/opencode)
- [goose](https://github.com/aaif-goose/goose)
- [Aider](https://github.com/Aider-AI/aider)

## Executive assessment

Recode has a strong coding-agent core: exact edits, first-class LSP, mature Pi-derived sessions and providers, a broad extension/SDK surface, bounded named specialists, and deliberately governed durable memory. O0–O8 materially improved Maestro's process, IPC, persistence, lease, workspace and native-service foundations.

Recode is **not yet a production release**, but the V1 lifecycle closure is complete as of 2026-07-29:

1. `MaestroLifecycleService` and `MaestroFullSessionLifecycleAdapter` now own the production full-session lifecycle over the existing supervisor backend.
2. Real child terminal transitions persist an outbox marker and enqueue exactly one O6 completion; restart recovery closes the before/after-enqueue crash windows idempotently.
3. Every Aizen and named-worker/reviewer run now has an independent race-safe provider-call iteration budget.

The remaining V1 blockers are local control-plane security, unattended mutation policy, coherent release/update identity, and Windows/Linux artifact certification. Telegram, richer ambient operation, and broad jcode benchmarking remain later work.

## O0–O8 cross-check against frozen Hermes

| Phase | Current assessment | Production consequence | Required closure |
|---|---|---|---|
| O0 contract/characterization | **Complete** | Baseline behavior and provenance are recorded. | Keep characterization tests in the release gate. |
| O1 public lifecycle model | **Complete** | The full-session lifecycle service/adapter is the production authority over the supervisor backend; waiting-input and attachment generations are synchronized. The worker adapter remains the conformance boundary for lightweight in-process workers. | Preserve one supervisor and retain production lifecycle integration tests. |
| O2 persistence/retention | **Complete for the implemented stores** | Atomic manifests, backups and terminal retention are materially stronger. | Add migration/compatibility fixtures and release-artifact recovery tests. |
| O3 deadlines/cancellation/shutdown | **Complete** | Child RPC/process shutdown is bounded, and independent Aizen/worker iteration budgets fail closed at their provider-call caps. | Preserve timeout, cancellation, consume/refund and exhaustion regressions. |
| O4 turn lease | **Complete in production supervisor** | Durable-session mutation is serialized and generation-safe. | Add process-level multi-client certification, not only unit coverage. |
| O5 attach/detach/reconnect | **Complete under its stated contract** | Ownership, waiting input, tails and receipt checks exist. Option A native-service restart intentionally terminates children, so reconnect is not a promise across planned native restart. | Document that boundary and test crash/restart/orphan outcomes on Windows and Linux. |
| O6 completion queue/handoff | **Complete** | Real terminal transitions persist terminal-result/outbox identity, enqueue once, recover before/after-enqueue crash windows, and retain claim/ack handoff semantics. | Preserve queue-capacity refusal and crash-window regressions. |
| O7 workspace safety | **Complete for current local model** | Read-only sharing and explicit sibling-worktree write admission fail closed. | Add Linux certification and hostile path/permission fixtures; keep Maestro non-mutating with respect to worktree creation/cleanup. |
| O8 service/TUI | **Feature complete; not release-certified** | Windows/Linux ownership, containment, health and board controls exist. | Certify native install/start/stop/restart/upgrade/uninstall, local IPC access control, crash loops and rollback on both operating systems. |

### Hermes behavior intentionally not copied

Keep these differences:

- Recode full sessions remain separate RPC processes rather than Hermes in-process agents.
- Aizen remains the default runtime; Maestro is its supervisor, not a replacement product.
- Named workers remain bounded private conversations, not unrestricted recursive swarms.
- Hermes messaging, scheduling and automatic-memory systems remain out of scope.
- Turn leases remain fail-closed; no timeout-based simultaneous transcript mutation.

## Whole-product production blockers

### Completed V1 lifecycle closure

- Connected O1 full-session lifecycle operations to production supervisor execution without adding another supervisor.
- Connected real terminal transitions to O6 through a persisted idempotent completion outbox.
- Added independent race-safe iteration budgets per Aizen/worker run.
- Added production process-identity capture and synchronized lifecycle waiting-input/attachment state.
- Added forced-exit and before/after-enqueue recovery regressions.

### Remaining P0 — Correctness and state projection

- Define one canonical externally reported state projection across lifecycle records, supervisor instance records, dashboard state and service health; detect impossible divergence.
- Extend process-level fault injection as new persistence boundaries are added.

### Completed P0 — Local control-plane security

- Every Maestro request and stream handshake now requires a private 256-bit current-user token; predictable endpoint and instance identities are not authority.
- Unix authentication/socket files are verified private, and Windows pipe creation explicitly refuses all-user read/write flags.
- RPC children receive an allowlisted runtime/provider environment plus explicit `REPI_MAESTRO_CHILD_ENV_ALLOW` exceptions instead of the complete service environment.
- Detached mutation is rejected unless the request has the current interactive owner and attachment generation.
- Bash has a narrow absolute-deny gate for catastrophic roots, home/credential stores, raw devices and fork bombs.

This does not create a sandbox. Processes running as the same operating-system user remain inside the trust boundary and can access user-owned files.

### P0 — Release, update and product identity

- Restore reviewed, idempotent npm trusted publishing before any release; do not substitute local publication.
- Resolve the private `repi-browser` distribution/license boundary or exclude it explicitly from public claims. `UNLICENSED` cannot support public redistribution.
- Produce one signed/checksummed release manifest tying source commit, package versions, browser/MCP package identities and every artifact hash together.
- Certify Node and Bun artifacts on Windows and Linux outside the workspace, including interactive startup and a real prompt.
- Finish linked-checkout versus package/binary update classification, confirmation/force semantics, rollback evidence and Windows symlink-layout regression coverage.
- Rewrite the root and coding-agent product entry docs around `recode`, Aizen, Maestro and workers. The current root README still points users to Pi identity, `pi` commands and an incomplete package list.
- Reconcile canonical operational documents. `update/PLAN.md` still lists completed Maestro work as unchecked and references a different release branch, while current work is on `agent-harness`.

### P0 — Release qualification

- Establish an authoritative cross-platform test matrix. The unrestricted suite is not currently a green Windows release gate; classify and fix real regressions separately from privilege/platform assumptions.
- Retain machine-readable startup, service and package-readiness artifacts for the exact release commit.
- Add upgrade and rollback tests from the immediately preceding Recode release.
- Add a diagnostic bundle that redacts secrets while capturing version/manifest identity, service health, restart history, bounded child state and relevant logs.

## Product comparison: what to adopt and what to resist

| Public product signal | Recode implication |
|---|---|
| Codex presents one coherent CLI with standalone installers, package-manager options, IDE, desktop and cloud paths. | V1 needs a coherent install/update identity and clear product surface before expanding channels. Recode does not need to copy every client. |
| Claude Code emphasizes direct native installers, terminal/IDE/GitHub use, plugins, managed settings and explicit data policy. | Recode should publish a support/privacy/telemetry statement, managed policy boundary and reliable installer path. Do not infer source-level behavior from the README. |
| OpenCode exposes explicit full-access `build` and read-oriented `plan` agents and ships terminal plus desktop distributions. | Make Recode's read-only versus write-capable modes visible and enforceable. A desktop client is not a V1 requirement. |
| goose presents CLI, desktop and API as one product, integrates MCP, supports custom distributions, and links diagnostics/known issues prominently. | Curate a first-party Recode distribution and diagnostic path while preserving the stronger Recode extension contract. |
| Aider emphasizes repository maps, Git workflow, automatic lint/test feedback, IDE watch and transparent model choice. | Preserve LSP/exact edits, then improve repository-context selection and opt-in validation loops. Do not adopt automatic commits as a default. |
| jcode's previously inspected daemon/session design emphasizes shared resources and many concurrent sessions. | O9 should optimize a proven single service after V1 correctness. Do not use an already-running daemon measurement to hide cold startup. |
| Hermes supplies precise lifecycle, lease, cancellation and budget invariants. | Finish the selected port by integrating it; do not broaden into Hermes's unrelated gateway/memory systems. |

## V1 — Production-safe single-machine Recode

**Goal:** a trustworthy Windows/Linux daily-driver release for one user, with Aizen, named workers and Maestro functioning as one coherent local product.

### Required work

1. Preserve the completed O1/O3/O6 lifecycle integration and conformance gates.
2. Preserve authenticated local IPC, verified local access controls, filtered child environments and attached-owner mutation policy.
3. Add deterministic destructive-command protection and approval-owner policy for unattended mutations.
4. Canonicalize lifecycle/supervisor/dashboard state and add forced-crash recovery tests.
5. Finish Recode identity, primary docs, support boundaries and diagnostic bundle.
6. Restore trusted publishing and certify exact Node/Bun release artifacts on Windows and Linux.
7. Finish safe updater classification, upgrade and rollback.
8. Preserve conformance for LSP, exact edits, sessions, workers, memory admission, extensions, browser/MCP readiness and project trust.

### V1 exit gate

V1 is complete only when:

- every production launch/status/wait/cancel/result/attach/detach/stop path is covered by the chosen single lifecycle authority;
- every eligible child terminal transition creates at most one durable completion, and recovery loses or duplicates none;
- iteration and concurrency limits fail closed under races;
- an unauthorized local process cannot control Maestro;
- release artifacts pass the same documented matrix on Windows and Linux;
- install, service setup, real prompt, restart, update and rollback are demonstrated from artifacts outside the repository;
- all product-facing docs name the actual Recode commands and support boundaries.

Telegram and broad jcode performance benchmarking are not V1 critical-path work.

## V2 — Efficient multi-session and fleet-ready Recode

**Goal:** make many sessions and several machines efficient and operable without weakening V1 isolation.

### Required work

1. Complete operational `recode doctor` before broader V2 optimization:
   - reuse existing subsystem health/discovery boundaries with minimal new code;
   - use Codex-style bounded redacted evidence and check isolation;
   - use Hermes-style service/database/executable coverage without automatic repair;
   - use jcode-style provider tiers and first-blocker guidance;
   - prove real provider, extension, Browser/MCP, Kioku, LSP and Maestro failure fixtures.
2. Execute O9 only from retained measurements:
   - share immutable provider/model metadata;
   - share verified package manifests and stable tool schemas;
   - share rebuildable read-only Kioku indexes safely;
   - give MCP/browser backends explicit service ownership, readiness, health and reconnect contracts;
   - keep credentials and mutable session state isolated.
3. Ratify startup SLOs using matched cold service, warm attach, TUI input, session-ready, integration-ready and first-model-event endpoints.
4. Add one visible multi-session workspace/picker with search, attach, read-only observe, pending approval and recovery diagnostics.
5. Add signed channel manifests, staged rollout, canary/rollback and fleet health for the primary machine, work PC, VPS and later Termux.
6. Add optional hybrid lexical/semantic memory retrieval while preserving Markdown authority, Teach/Cardinal admission, provenance and stale-evidence rules.
7. Curate default browser/MCP packages under explicit licensing, permissions and compatibility policy.

### V2 execution boundary

Near-term work is grouped into four phases: V2-A certify the frozen Doctor checkpoint; V2-B direct Maestro attach and searchable workspace/session filtering; V2-C matched configured/isolated cold and warm startup plus service cold-start, warm-attach and one/ten-session measurements; V2-D measurement-justified non-memory O9 sharing. Stop for Creator review before changing automatic memory retrieval, adding semantic reranking/embeddings or sharing Kioku indexes.

### V2 exit gate

- Ten-session resource and latency measurements are retained for one and ten idle/active sessions.
- Shared services demonstrably reduce duplication without cross-session credential, workspace or transcript leakage.
- Upgrade/rollback succeeds across the supported machine set from one exact artifact set.
- Service and package degradation remain visible and do not falsely report readiness.

## V3 — Multi-channel and ecosystem Recode

**Goal:** add remote/channel clients and broader product surfaces on top of stable local contracts.

### Candidate work

1. Attach Telegram through the channel-neutral completion/input contracts; do not fork lifecycle, approval or memory semantics.
2. Define remote authentication, device enrollment, authorization scopes, revocation, rate limits, replay protection and audit records before exposing Maestro beyond local IPC.
3. Add channel-neutral approval and waiting-input flows with explicit timeout and handoff behavior.
4. Consider IDE/desktop/web clients as replaceable clients of the same session/service contracts.
5. Add package signing/trust tiers, compatibility certification and a curated registry/distribution policy.
6. Evaluate optional background jobs, notifications, repository maps, test/lint loops, Mermaid and voice as packages or clients rather than mandatory core features.
7. Run the exact-source Recode/jcode/upstream Pi contract and performance checkpoint after V1 is clean and a jcode toolchain or release artifact is available.

### V3 exit gate

- Remote channels cannot bypass local approval, workspace, credential, memory or lifecycle policy.
- Delivery is idempotent across reconnects and channel retries.
- Revocation and incident recovery are tested.
- New clients do not create a second session authority or supervisor.

## Explicit non-goals through V1

- Telegram implementation.
- Unrestricted recursive swarms.
- Automatic worktree creation, cleanup, merge, reset or stash.
- Silent memory extraction or consolidation.
- Automatic commits by default.
- A desktop client solely for feature parity.
- Claims of sandboxing without an enforced isolation boundary.
- Performance claims based on unmatched lifecycle endpoints.

## Immediate implementation order

1. Production lifecycle integration and state authority — complete.
2. Iteration-budget implementation and race conformance — complete.
3. Production terminal-to-completion wiring and crash-window tests — complete.
4. Local control-plane security and catastrophic-command safeguards — complete.
5. Release/documentation/update canonicalization.
6. Windows/Linux artifact and service certification.
7. Only then: O9 measurements, Telegram design, or jcode benchmark execution.
