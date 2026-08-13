# Update Decisions

This file records accepted architectural decisions. Proposed ideas remain in `PLAN.md` until accepted.

## D-001 — Recode identity must be preserved

**Status:** Accepted

The updater must treat this customized Recode repository and `@reitaard/repi-coding-agent` as the installed product. It must not silently replace Recode with `@earendil-works/pi-coding-agent` or rename the command from `recode` to `pi`.

**Reason:** The repository has intentionally diverged from upstream and contains Recode-specific runtime, extensions, branding, and workflows.

## D-002 — Upstream is an integration source

**Status:** Accepted

`https://github.com/earendil-works/pi.git` is an upstream source of changes, not automatically the release authority for the customized product.

**Reason:** Upstream version availability does not establish compatibility with Recode customizations.

## D-003 — Credentials remain outside repository files

**Status:** Accepted

GitHub MCP authentication uses the `GITHUB_PAT_TOKEN` environment variable. Tokens must not be written to `.mcp.json`, update documentation, logs, source files, or commits.

## D-004 — Linked checkout updates require a distinct strategy

**Status:** Accepted

A globally linked source checkout must not use the published-package uninstall/install path. Installation classification must occur before mutation.

**Reason:** Reinstalling a global package replaces the link but does not update the source checkout.

## D-005 — Canonical release branch and fork tags

**Status:** Superseded by D-008

`repi/canonical` was the initial release line, but visual and source audits proved that its 0.82 port omitted custom UI and runtime functionality. It remains available for reference and recovery.

## D-006 — Source updates fail closed

**Status:** Accepted

Source-linked updates require a clean branch and a fast-forward relationship to the selected RePi release tag. Dirty, detached, and diverged checkouts are refused. The updater never stashes, resets, rebases, or resolves conflicts automatically.

## D-007 — Three-way upstream planning

**Status:** Accepted

Upstream analysis compares the recorded Pi baseline tree with both the committed Recode tree and a target upstream revision. `recode upstream status|plan` classifies custom-only, upstream-only, identical, protected, overlapping, and renamed paths without modifying source files. Pure Recode paths are declared in `repi/upstream-ownership.json`; shared paths are never silently excluded from compatibility review.

## D-008 — Feature-complete custom tree is authoritative

**Status:** Accepted

The release line starts from exact commit `c5ab200b`. Upstream Pi changes are classified from common baseline `1f9e846c` and reported without source mutation. No custom path is replaced merely to claim a newer upstream version. A normal npm package may replace the development symlink only after isolated and visual parity tests.

## D-009 — Worker private chats are modal, not root sessions

**Status:** Accepted

Levi, Mayuri, and Shiori private chats run as modal, independently cancellable worker conversations inside the current Aizen runtime. They keep their own conversation ids and custom-entry history but never call root-session replacement or rename the Aizen session. One-shot tasks remain independent and deliver explicitly untrusted handoffs. Delegation is enabled by default with an explicit environment opt-out. All workers share read-only Kioku search under the stale-evidence policy; memory admission remains unavailable to worker tools.

## D-010 — Extend the existing orchestrator for full-session concurrency

**Status:** Accepted

Multiple full Aizen sessions will use `packages/orchestrator` as the single supervisor foundation. Each background session is an isolated RPC child process with attach/detach, bounded admission, scoped cancellation, persisted ownership metadata, and optional verified worktree isolation. Named workers remain lightweight and do not become processes by default.

## D-011 — Optimize from measurements and reuse existing boundaries

**Status:** Accepted

Latency work starts with stage-level measurements. Prefer schema/prompt caching, lazy loading, event-driven waits, and conservative parallel read-only tools. Do not add SQLite, deep delegation, multi-platform gateways, or automatic background review until measurements establish need.

## D-012 — One certified release serves every deployment

**Status:** Accepted

Windows, Linux, Termux, the primary machine, work PC, and VPS must consume artifacts from one reviewed source commit and release manifest. Extend the existing local-release, binary, Termux, and GitHub workflow; do not clone and rebuild independently on each deployment machine. Remote rollout occurs only after local certification and explicit authorization, with inventory and rollback evidence.

## D-013 — Port Hermes lifecycle contracts through Recode adapters

**Status:** Accepted

Freeze Hermes Agent at exact reviewed commit `5b22bd955682a8fc7b07769784c5129e23f53eaf` and faithfully translate its public lifecycle state machine, bounds, cancellation/result semantics, iteration-budget behavior and relevant turn-lease invariants. Preserve required MIT attribution. Bind the port through separate adapters for existing named workers and full orchestrator-owned RPC sessions rather than replacing either Recode implementation with Hermes’s in-process `AIAgent` executor.

**Reason:** Hermes provides the preferred tested lifecycle contract, while Recode requires durable process identity, restart verification and attach/detach behavior that Hermes’s in-process executor does not provide.

## D-014 — Ratify gaps and SLOs only after an exact three-way checkpoint

**Status:** Accepted

After the S2–S3 package/readiness work and O0–O8 Hermes lifecycle/service checkpoint, clone a fresh exact jcode revision and fetch an exact upstream Pi revision. Compare Recode, jcode and upstream Pi through mapped behavioral contracts, native/translated tests and matched lifecycle performance probes. Hermes remains lifecycle provenance, not a fourth product score. Raw test counts and unlike startup endpoints are not accepted as comparative evidence.

**Reason:** Final performance targets and service optimization order should follow executable evidence from exact implementations, not README claims, moving branches or language-level assumptions.

## D-015 — RePi Browser is a required first-party package

**Status:** Accepted

Include `repi-browser` in certified Recode package sets and the later Recode/jcode/upstream-Pi checkpoint even while its source package remains private. Use it as the first controlled S2 built-artifact/runtime-contract migration. Private status must not silently remove browser capability. Public redistribution remains blocked until explicit license/distribution terms replace the current `UNLICENSED` package state.

**Reason:** Browser control is an intentional Recode product capability and the largest controlled extension graph. Excluding it would produce misleading startup and feature comparisons.

## D-016 — Maestro is the full-session conductor

**Status:** Accepted

Name the orchestrator-owned full-session service **Recode Maestro**. The canonical command contract is `recode maestro <command>`; `recode` remains the default Aizen runtime and `recode aizen` becomes its explicit subcommand. After O0 characterizes current behavior, O1 removes the existing `--aizen` flag as explicitly approved. Direct named-worker chats use `recode worker <levi|mayuri|shiori>` with stable convenience aliases `--levi`, `--mayuri`, and `--shiori`; those aliases route directly to the private worker conversation and do not add an Aizen delegation/model turn. `packages/orchestrator` remains the implementation package until lifecycle stabilization makes a physical rename safe.

**Reason:** Maestro accurately describes one conductor managing multiple full Aizen sessions. Subcommands provide a scalable namespace for lifecycle operations, while stable worker aliases keep direct specialist chats inexpensive and convenient without misclassifying workers as root runtimes.

## D-017 — Maestro never owns worktree lifecycle

**Status:** Accepted

Maestro persists canonical workspace ownership receipts but marks every selected workspace `managed: false`. Read-only full sessions may share a workspace only with tools disabled and mutating RPC paths rejected. Concurrent write-capable sessions require distinct worktrees; a write-capable child must use an explicitly selected sibling worktree with the same verified Git common directory as its parent. Maestro never creates, merges, resets, stashes, removes, or cleans a worktree, and restart reconnect fails closed when the persisted receipt is missing, ambiguous, or no longer matches the selected workspace.

**Reason:** Full-session concurrency requires deterministic write ownership without giving a long-lived service destructive repository-management authority.

## D-018 — Native Maestro supervision uses option A containment

**Status:** Accepted

Maestro has exactly one verified Windows/Linux service owner. Linux uses a systemd user unit with control-group termination; Windows uses Task Scheduler with a kill-on-close Job Object host. Planned stop or restart stops admitting mutations, drains within a deadline, persists its classification, and then terminates all remaining owned descendants. A process crash is classified independently from degraded optional adapters. No fallback watcher runs concurrently with native supervision.

**Reason:** Terminating owned children on service loss avoids ambiguous dual ownership and unverifiable adoption while preserving deterministic restart behavior across both supported service platforms.

## D-019 — Production lifecycle closure uses one authority and a durable completion outbox

**Status:** Accepted

`MaestroLifecycleService` and `MaestroFullSessionLifecycleAdapter` own full-session lifecycle operations over the existing `OrchestratorSupervisor` backend; they do not introduce another supervisor. Production terminal transitions persist terminal identity and an outbox marker before/with idempotent O6 enqueue. Every Aizen and named-worker run has an independent provider-call iteration budget.

**Reason:** O1–O6 conformance must govern real execution rather than test-only components, and service crashes must not lose or duplicate child completion delivery.

## D-020 — Maestro local control is authenticated but remains a same-user trust boundary

**Status:** Accepted

Every local IPC request and stream handshake requires a private current-user token, endpoints use restrictive platform access settings, child environments are allowlisted, and detached mutation requires the current interactive owner. Recode also denies narrowly defined catastrophic shell targets. These controls do not claim sandboxing: processes running as the same operating-system user remain in the trust boundary.

**Reason:** A long-lived unattended service needs deterministic authorization and secret minimization without misrepresenting same-user host execution as isolation.

## D-021 — The next stable compatibility release is Recode 0.81.5

**Status:** Accepted

The next release candidate for the existing `@reitaard/repi-coding-agent` package is exactly `0.81.5`. Development-distance and source-commit suffixes remain limited to local development artifacts; stable versions do not encode commit identity. The immutable release manifest carries source commit and custom-baseline provenance instead. Publication from this repository is deferred. A later clean `recode` repository and any package-name/version-line reset require a separate explicit migration decision so npm ordering and `recode update` cannot interpret the new product as a downgrade.

Self-update discovery remains disabled in the shipped CLI until a validated Recode-owned release endpoint and manifest-verification path are built in. Extension-only updates remain independent.

**Reason:** Recode has materially diverged from upstream Pi, but the currently installed npm identity already has `0.81.x` versions. `0.81.5` provides one stable compatibility checkpoint without embedding development provenance in SemVer or prematurely committing the future repository to a package migration.

## D-022 — Release provenance uses an embedded identity manifest and detached artifact index

**Status:** Accepted

Every npm package, Bun binary archive, Termux archive and source archive carries the same deterministic `recode-release.json` identity manifest. It binds product/package identity, stable version, exact tag when applicable, source commit, custom baseline, runtime requirement and supported artifact matrix. Final archive sizes and SHA-256 values live in a detached `recode-artifacts.json` index bound to the embedded manifest hash; `SHA256SUMS` covers both the release artifacts and detached index.

**Reason:** An archive cannot embed its own final cryptographic hash without a circular value. The two-layer format preserves identical embedded provenance while giving release consumers final-byte hashes and sizes.

## D-023 — Recode Doctor diagnoses operations through existing subsystem boundaries

**Status:** Accepted

`recode doctor` remains a read-only, secret-safe diagnostic command rather than an agent persona or repair engine. Keep its implementation small by orchestrating existing provider discovery, package runtime contracts, Maestro lifecycle projection, Browser/MCP health, Kioku storage and LSP boundaries. Packages, extensions, capabilities, services and MCP servers are discovered generically from configured installation paths, standard configuration locations and runtime declarations; Doctor never keys behavior to known package names or a fixed component count. Human output stays grouped into bounded product categories rather than emitting one top-level check per component. Use Codex Doctor as the reference for bounded concurrent checks, structured redacted evidence and failure isolation; Hermes Doctor for practical service/database/executable coverage without automatic repair; and jcode Provider Doctor for offline/catalog/explicit-full tiers and first-blocker guidance. Default live probes may perform bounded non-generation health/catalogue requests but never paid model generation, state mutation or automatic repair.

**Reason:** Presence-only checks do not answer why Recode cannot work now. Reusing production boundaries minimizes duplicate logic while proven external diagnostic patterns provide actionable failure classification.

## D-024 — The next local certification checkpoint is Recode 0.81.6

**Status:** Accepted

Use lockstep version `0.81.6` for the post-Doctor, ten-session Maestro and V2-C benchmark binary so it is distinguishable from the previously installed/certified `0.81.5` artifacts. This authorizes a local Windows x64 build for Creator installation and testing; it does not authorize npm publication, tagging, remote rollout or self-update enablement.

**Reason:** Reusing `0.81.5` would make materially different binaries ambiguous during installation and performance comparison.

## D-025 — VPS follows the exact Recode 0.81.6 certification checkpoint

**Status:** Accepted

With explicit Creator authorization, deploy the exact committed `0.81.6` Node artifact from source `f287dff3ac8a9c84522f94bb711566badbc2e609` to the VPS. Preserve `/opt/recode/0.81.5`, the prior wrapper, configuration/session inventory and Maestro state as rollback evidence. Switch only after isolated and remote preflight checks, then verify release identity, offline RPC/Doctor, Maestro health, one read-only session and rollback/rollforward.

**Reason:** The VPS was behind the locally certified Doctor, Maestro, capacity and startup fixes. Exact artifact transfer preserves fleet identity without cloning or rebuilding remotely.

## D-026 — Retire the previous live VPS runtime after verified rollforward

**Status:** Accepted

After explicit Creator approval, terminate the verified foreground `0.81.5` process and remove `/opt/recode/0.81.5` once the `0.81.6` wrapper, Maestro service, release identity, rollback and rollforward checks pass. Retain the exact `0.81.5` tarball and rollback inventory rather than a second live installation tree.

**Reason:** Only one live install path should remain addressable after certification; archived bytes and inventory provide rollback without mixed runtime resolution.

## D-027 — Recode 0.82.1 adopts the root credential and model runtime

**Status:** Accepted

Recode uses the upstream root `CredentialStore` and `ModelRuntime` architecture for provider authentication, model refresh, and native provider registration. Existing `auth.json` data remains readable through the store. Open Provider retains dynamic OpenAI-compatible endpoint/model discovery and must complete migration of its saved key into the root store before release. Recode OpenAI OAuth and Radius remain product providers rather than independent credential authorities. JSONL remains the default session store; SQLite is optional.

**Reason:** A single serialized credential authority prevents duplicate refreshes and lets built-in, native, local, and extension providers share the same authentication lifecycle without removing Recode provider capabilities.

## D-028 — v0.84.1 retains V3 runtime and inactive upstream facilities

**Status:** Accepted

The v0.84.1 direct port preserves Recode's V3 JSONL runtime. Clean upstream Session V4 source is retained only as the inactive `@reitaard/repi-agent-core/session-v4` library API; adapters, dual journals, V4 application migration, and SQLite activation are excluded. Telemetry is adopted as a Recode-namespaced passive contract package. Protocol, client, server implementation, evals, and SQLite-backend sources remain in the repository but are not wired into active runtime, CLI, workspace build, manifests, or release artifacts without explicit Creator approval. The intended completed-port release is lockstep Recode `0.83.0`.

**Reason:** This preserves Recode behavior and user sessions while retaining upstream work for separately scoped adoption.

## Pending decisions

- Final package identity and initial version for the future standalone `recode` repository
- Exact curated source-transfer policy for the future standalone `recode` repository
- Whether a later `recode upstream prepare` command should create an isolated integration worktree
- Dependency-refresh policy
- Final development symlink repoint procedure
