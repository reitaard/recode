# Recode product shortcomings backlog

**Recorded:** 2026-07-30

**Source checkpoint:** `bde499491`

**Evidence:** [`COMPARE.md`](COMPARE.md) and [`evidence/2026-07-30-three-way-checkpoint.json`](evidence/2026-07-30-three-way-checkpoint.json)

## Purpose

This is the compact implementation backlog derived from the exact Recode, jcode `v0.54.4`, and upstream Pi checkpoint. It tracks user-facing friction rather than reopening completed lifecycle/security work.

Recode's strongest foundations must remain intact:

- exact edit and first-class LSP;
- one Maestro lifecycle authority and one supervisor;
- authenticated local IPC, owner generations, turn leases and workspace receipts;
- bounded named workers;
- extension/package/SDK contracts;
- Markdown memory authority and Teach/Cardinal admission.

## P0 — Product-entry shortcomings

### S1. Maestro startup is not yet reliably invisible and durable on Windows

**Current behavior**

- The scheduled task launches immediately at logon, which is positive perceived-startup evidence.
- After the 2026-07-30 PC restart, the task had run successfully and returned `Last Result: 0`, but the Maestro pipe was no longer available and Task Scheduler reported `Ready`, not `Running`.
- The installed `0.81.5` task still uses the visible PowerShell host. Commit `bde499491` generates a hidden host/child but is not installed yet.

**User impact**

The service can appear to start quickly while not remaining available. A user cannot distinguish successful readiness from an immediately completed task.

**Current source progress**

- Native install, start and restart now wait for authenticated `health.ready` instead of reporting Task Scheduler/systemd launch as service success.
- Service installation stops the previous runtime before launching the replacement, preventing stale health from falsely certifying an older process.
- Service status projects persisted health plus verified process identity as running, stopped or unexpectedly exited.
- Unexpected signals under native supervision are classified as crashes; manual foreground signals remain planned stops.
- A clean isolated source smoke reached ready in 2,073.6 ms and completed a planned shutdown with exit code 0.
- Stable `0.81.5` artifact `4cb7ded1…` from source `5d37b556c` is installed. Its hidden Windows task reached authenticated ready health and remained `Running`; a read-only child reached lifecycle `RUNNING` in 9,210 ms.
- Automatic hidden logon startup still requires one reboot certification before this shortcoming is closed.

**Required outcome**

- Install the post-`bde499491` hidden task definition.
- Prove automatic logon startup reaches `health.ready=true` and remains active.
- Retain bounded startup duration and exit diagnostics.
- Make `service status` distinguish `not installed`, `starting`, `running`, `stopped`, and `exited unexpectedly`.

**Acceptance**

A restart-to-ready artifact records task launch, service health, elapsed time, and 60 seconds of stable availability without a visible console.

### S2. Session startup remains slow and previously produced false timeout failures

**Current behavior**

A cold read-only child exceeded the former five-second IPC deadline but later reached `online` after approximately 21.5 seconds. Commit `bde499491` raises cold spawn to 60 seconds and mutating operations to 30 seconds.

**User impact**

Users can receive an error while a background session is still created, leaving an unexpected live child.

**Required outcome**

- Package and install the corrected deadlines.
- Retain process start, session-ready, integration-ready and model-ready timings.
- Cancel or explicitly report any operation that outlives its client deadline.
- Execute the one/ten-session resource checkpoint only after this correction is installed.

### S3. Recode Doctor must diagnose operational failures

**Current behavior**

The first `recode doctor` foundation is implemented. It runs without Aizen or extension execution and reports bounded, secret-safe local state for release identity, installation classification, settings, provider/model selection, credential presence, configured packages, Browser/MCP/web presence, Maestro health, memory files and LSP settings.

That foundation is not sufficient to explain why Recode cannot work now. It verifies configuration and presence but does not yet prove provider reachability, extension loading, backend startup, MCP handshakes, Kioku integrity, language-server execution or native-service agreement.

**User impact**

A healthy-looking configuration can still fail at runtime. The user still has to inspect individual errors to distinguish unreachable providers, rejected authentication, missing models, extension load failures, backend crashes, unavailable executables, corrupt indexes and Maestro state divergence.

**Required outcome**

Keep `recode doctor` read-only, bounded, secret-safe and model-free by default, but make the next V2 phase operationally useful:

- preserve the existing offline foundation and stable JSON schema;
- add a bounded selected-provider endpoint probe that does not send a generation request or incur model usage;
- classify DNS, route, timeout, refusal, TLS, HTTP/auth and selected-model catalogue failures without guessing the cause;
- discover configured packages, extensions, declared capabilities, services and MCP servers generically, without package-name checks or fixed component counts;
- organize bounded output by product category while retaining per-component evidence only for failures or requested detail;
- verify extension runtime contracts and loading in an isolated diagnostic process;
- verify declared Browser/backend ownership, startup and readiness through generic service health contracts without opening a user session;
- verify all discovered MCP configurations, executable availability and an optional bounded handshake;
- verify Kioku schema/integrity/lock/staleness and rebuild eligibility without mutating the index;
- verify configured LSP executable discovery, startup and initialization without editing project files;
- compare Maestro IPC health, native service state, process ownership and canonical projection, emitting `STATE_DIVERGENCE` when they disagree;
- rank the most likely root cause, suppress secondary noise and print one simple corrective action;
- keep paid/model requests, repairs, installs, service starts and index rebuilds behind separate explicit authorization.

### S4. Entering and reattaching to sessions is harder than necessary

**Current behavior**

The Maestro board can select and attach to sessions, and RPC stream attachment exists, but there is no direct documented `recode maestro attach <id>` or unified cross-workspace picker.

**User impact**

Users must understand the distinction between foreground sessions, `/resume`, Maestro board sessions and RPC streams.

**Required outcome**

- Add direct attach by id/label.
- Add a searchable workspace/session picker.
- Clearly distinguish foreground replace, read-only observe, interactive attach, detach, cancel and destructive stop.
- Keep one interactive owner and many read-only observers.

### S5. Installation and update are not yet a normal end-user journey

**Current behavior**

Artifacts, provenance, classification, confirmation and rollback receipts exist. Public trusted npm publication and Recode-owned update metadata do not; self-update remains disabled.

**User impact**

Installing or upgrading Recode still requires internal artifact knowledge, unlike a normal one-command product installer.

**Required outcome**

- Restore reviewed idempotent trusted publishing.
- Publish signed/checksummed Recode channel metadata.
- Make installers verify identity and hashes.
- Preserve rollback and refuse foreign package identity.
- Never replace a source checkout through a package-manager strategy.

## P1 — Integrated-product shortcomings

### S6. Browser, MCP and web access are capable but not one durable default distribution

**Current behavior**

The deployed package set provides sophisticated guarded browser, MCP and web tools. Some third-party packages required local built-runtime contracts, and `repi-browser` still has a private licensing/distribution boundary.

**Required outcome**

- Publish reproducible built extension artifacts.
- Pin compatibility and hashes in a curated Recode distribution.
- Resolve browser redistribution terms.
- Expose backend ownership, readiness, reconnect and shutdown through `recode doctor`.

### S7. Provider and account troubleshooting is fragmented

**Current behavior**

Recode supports broad providers and OAuth, but no equivalent of jcode's provider doctor, auth test and coverage commands exists.

**Required outcome**

Provide guided, secret-safe catalogue, credential, refresh, model-selection, transport and first-request diagnostics without making a paid request unless explicitly approved.

### S8. Background completion is not a unified user inbox

**Current behavior**

Maestro completion handoff and Telegram jobs are durable, but there is no channel-neutral list of completed jobs, pending approvals, waiting input and failed deliveries.

**Required outcome**

Add a bounded notification/inbox projection shared by foreground TUI, Maestro and later remote clients. Delivery remains idempotent and transcript mutation remains controlled by the lifecycle authority.

### S9. Remote enrollment and authorization are incomplete

**Current behavior**

Telegram supports one statically authorized private user. Pairing, device scopes, revocation, replay protection and channel-neutral approvals are absent.

**Required outcome**

Define remote authentication before adding channels:

- pairing and device enrollment;
- scoped capabilities;
- revocation and rotation;
- replay/rate-limit protection;
- audit records;
- approval and waiting-input timeouts.

### S10. Kioku retrieval lacks an optional semantic layer

**Current behavior**

Kioku has governed Markdown authority and conservative lexical retrieval. jcode provides richer vector/graph retrieval but weaker human admission boundaries.

**Required outcome**

Add optional hybrid lexical/vector ranking while preserving Markdown authority, project scope, provenance, stale-evidence handling and Teach/Cardinal admission. Do not add silent extraction.

### S11. Approval state is distributed across subsystems

**Current behavior**

Project trust, Maestro ownership, extension UI requests, browser consent and future remote approvals are separate.

**Required outcome**

Create a common read-only approval projection and client UI without weakening subsystem-specific enforcement.

## P2 — Valuable but deferrable

- Mermaid and side-panel presentation.
- Voice/dictation package.
- Desktop or IDE client.
- Richer first-party widgets.
- General background scheduler.
- Broader swarm messaging and plans.

These do not precede startup reliability, doctor, session entry, distribution, integration readiness or remote authorization.

## Ordered implementation plan

### V2 completion

1. Package/install `bde499491` or its reviewed successor.
2. Certify hidden durable Windows startup and corrected IPC deadlines.
3. Complete operational Recode Doctor in the next phase:
   - retain the implemented offline foundation;
   - use Codex Doctor's bounded parallel checks, structured evidence and centralized redaction;
   - use Hermes Doctor's service/database/tool coverage without its automatic repair behavior;
   - use jcode Provider Doctor's offline/catalog/full tiers and first-blocker guidance;
   - validate real provider, extension, Browser, MCP, Kioku, LSP and Maestro failure fixtures.
4. Build/install the completed Doctor and certify it against an installed artifact.
5. Add direct attach and the searchable session/workspace picker.
6. Retain valid one/ten-session latency and memory evidence.
7. Execute O9 sharing in measured order:
   - verified package manifests and stable schemas;
   - provider/model catalogue;
   - rebuildable read-only Kioku indexes;
   - MCP/browser service ownership.
8. Add optional hybrid Kioku retrieval.
9. Finish curated extension artifacts and installer/update-channel UX.

### V3 entry

1. Generalize Telegram behind pairing, scopes, revocation and replay protection.
2. Add the unified completion/approval inbox.
3. Add replaceable remote/IDE/web clients over existing lifecycle contracts.
4. Add package signing/trust tiers and curated registry policy.
5. Evaluate desktop, voice, Mermaid and richer workspace surfaces.

## Deferred Maestro user guide

The Creator requested a practical Maestro/orchestrator walkthrough after the product is ready. The guide should cover:

- service install/start/status/health;
- read-only versus isolated-write spawn;
- board navigation;
- attach, observe and detach;
- prompt and pending-input handling;
- cancel versus destructive stop;
- completion handoff to Aizen;
- recovery and diagnostics.

This tutorial is intentionally deferred and is not an implementation blocker.
