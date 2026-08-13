# Recode vs jcode vs upstream Pi — exact checkpoint

## Scope and provenance

**Review date:** 2026-08-02 (V2-C update)

| Product | Exact source/artifact | Execution status |
|---|---|---|
| Recode | installed `0.81.6` Windows x64 baseline from `c86c809a19fb94c1cb23da403d51b4eed8cfd27a`, followed by the bounded three-cycle optimization through standalone minification with preserved function names | Configured/isolated compiled TUI and RPC startup, compiled Maestro service/session control, and ten-session admission/resources exercised without provider requests |
| jcode | tag `v0.54.4`, commit `fb7a5ea501e56084fa665b91b52ece9ab7761c3c`; official Windows x64 binary SHA-256 `2572765b72f776ef4bfdd41efc055e0078910d60aae600aa35c6b1fcb5f54523` | Binary version/help and daemon-control probes executed; source archived and inspected; Rust tests not run because no Rust toolchain is installed |
| upstream Pi | `earendil-works/pi` `c820aa26fe0907e053e881a957722693fc094c9c` | Source/reference baseline; no new standalone execution in this checkpoint |
| Hermes | `5b22bd955682a8fc7b07769784c5129e23f53eaf` | Lifecycle provenance only, not a fourth product |

The previous comparison was stale: it described Maestro as untested and unsafe before O0–O8, lifecycle integration, completion recovery, IPC authentication, workspace admission and service supervision were completed. This report supersedes those statements.

## Executive verdict

Recode now has the stronger **programmable and governed coding-agent substrate**: exact edits, first-class LSP, broad extension/SDK/package contracts, explicit project trust, bounded named specialists, human-governed memory, and a tested fail-closed full-session lifecycle.

jcode `v0.54.4` has the stronger **integrated end-user product experience**: one-command installers, fast persistent-daemon clients, a broad command surface for provider diagnosis, auth tests, browser setup, accounts, ambient jobs, permissions, pairing, voice and session operations, and published binaries across more platforms.

Upstream Pi remains the mature base for Recode's agent/session/provider/extension behavior, but does not contain Recode's Aizen, workers, Kioku, LSP, Maestro lifecycle/security, Telegram gateway, release identity or guarded browser distribution.

The remaining gap is no longer “Recode lacks an orchestrator.” It is that Recode's good internal contracts are still exposed through a less polished, slower and more fragmented user journey. The implementation backlog is maintained in [`SHORTCOMINGS.md`](SHORTCOMINGS.md).

## Direct observations from this checkpoint

Machine-readable evidence is retained in [`Analyze/evidence/2026-07-30-three-way-checkpoint.json`](evidence/2026-07-30-three-way-checkpoint.json).

### Recode

- The exact `0.81.5` artifact passed Windows isolated package checks and Linux x64 deployment checks, including a real prompt, configured RPC child, systemd-user Maestro service, read-only Maestro session, Telegram restart and rollback/rollforward.
- A cold Windows Maestro spawn exceeded the CLI's fixed five-second IPC timeout, but the child continued and reached `online` about 21.5 seconds after creation. The timeout therefore reported failure while creating a live session. This checkpoint changes spawn to a bounded 60-second deadline and mutating requests to 30 seconds.
- Starting Maestro through the Windows scheduled task opened a visible PowerShell console. This checkpoint hides both the PowerShell task host and its child process.
- Earlier retained configured-runtime measurements remain the valid Recode baseline: approximately 3.76 seconds warm RPC readiness and 4.26 seconds warm TUI input/integration readiness. The dominant cold cost was extension/package import and initialization.

### V2-C optimization and matched-comparison update

- The installed Recode `0.81.6` compiled baseline measured configured TUI at 4,035.8 ms, configured RPC at 3,889.8 ms, isolated TUI at 778.3 ms and isolated RPC at 891.0 ms. Caches were uncontrolled.
- Corrected compiled Maestro measured 930.8 ms service readiness, 1.0 ms warm direct control, 536.9 ms warm CLI control, 4,335.6 ms configured read-only session spawn and 2.4 ms warm attach. It admitted ten sessions.
- The bounded optimization loop fixed compiled identity/session launch, then minified standalone bundles. Maestro's short-lived command median improved 11.2%, its binary shrank 4.4%, and isolated RPC readiness improved 18.2% to 729.0 ms. Preserving function names added only 512 bytes and did not regress the measured command endpoint.
- Configured RPC remained essentially unchanged at 3,876.3 ms because configured extension/package initialization dominates it. No unsafe parallel extension initialization or feature removal was introduced.
- The exact jcode artifact was reverified. Its short-lived `--version` endpoint measured 32.1 ms median versus optimized Maestro's 388.5 ms, confirming jcode's native CLI advantage. jcode daemon/session/resource endpoints remained unavailable without configuring credentials, so no lifecycle or resource ratio is claimed.
- Recode's corrected compiled ten-session attribution repeat measured 5,037,240,320 bytes aggregate working set: 4,480,823,296 bytes (89.0%) private and 556,417,024 bytes non-private. Three configured RPC processes averaged 485.7 MB private working set versus 129.1 MB for isolated-agent-dir processes, a 356.6 MB configured-runtime delta. Shared executable pages are therefore not the primary cause; mutable session processes must remain isolated while immutable package/module or explicit service sharing is evaluated separately.

Artifacts: [`Analyze/evidence/v2-c-2026-08-02/`](evidence/v2-c-2026-08-02).

### jcode

- The verified `v0.54.4` Windows binary exposes integrated `server`, `connect`, `run`, `login`, `account`, `memory`, `ambient`, `pair`, `permissions`, `browser`, `provider-doctor`, `auth-test`, `restart`, `dictate` and session/model commands.
- Three warm `debug list` probes against its daemon took 95.0, 39.3 and 38.7 ms. This is a daemon control endpoint, not model/session readiness.
- `server start` held the invoking process through the 120-second probe deadline even though later daemon commands worked. That cold measurement is invalid and is not used as a performance claim.
- The `v0.54.4` README publishes 14.0 ms first frame, 48.7 ms first input, and 117.0 MB PSS for ten sessions with local embeddings disabled. Those measurements identify a different development build (`be386f2`) and are not independently reproduced here.

No ratio is reported: Recode session readiness, jcode daemon command latency and jcode's published first-frame metric are different lifecycle endpoints.

## Full product comparison

| Area | Recode checkpoint | jcode `v0.54.4` | Judgment |
|---|---|---|---|
| Core coding loop | Mature Pi-derived streaming loop, retries, compaction, JSON/RPC/SDK modes | Mature integrated loop with broad tools/providers | Tie without same-model task evaluation |
| Exact file mutation | Exact replacement edit plus serialized write/edit queues | Patch/write tools and agent grep | Recode stronger for deterministic edits |
| Code intelligence | First-class LSP diagnostics, symbols, references, hierarchy, rename, format and code actions | Workspace/LSP work exists but is not an equivalent central public surface | Recode clearly stronger |
| Session history | Transparent JSONL tree, branch/fork/clone/export | Server-owned sessions, cross-harness resume and memorable names | Different strengths; jcode easier across harnesses |
| Multi-session lifecycle | Maestro owns launch/status/wait/cancel/result/attach/detach/stop with durable recovery | Persistent server and lightweight reconnecting clients | Recode stronger invariants; jcode smoother user experience and lower duplication |
| Visible session workspace | Maestro board shows health, branch, activity, output, input and controls | Persistent clients plus broader session commands; multi-surface workspace remains evolving | jcode easier to enter; Recode board is safer but separate |
| Direct attach | `recode maestro attach <id-or-label>`, bounded search and searchable dashboard entry are implemented | `connect`, resume and session commands are obvious | Both are direct; jcode remains more integrated into its primary daemon UX |
| Named specialists | Levi, Mayuri and Shiori are bounded, private and tool-scoped | General swarm members and autonomous teams | Recode for disciplined specialists; jcode for general collaboration |
| Swarm coordination | Concurrent workers and full sessions, but no shared plan/DM/touch protocol | DMs, broadcasts, plans, task graph, touch notifications and bounded swarm modes | jcode |
| Memory authority | Markdown source, project/global scopes, Teach/Cardinal admission, read-only worker recall | Automatic extraction, local embeddings, graph retrieval and consolidation workflows | Recode for governance; jcode for automation/semantic depth |
| Memory retrieval | SQLite FTS plus conservative injection | Semantic vectors, graph traversal and side-agent relevance | jcode technically; hybrid retrieval is a valid Recode V2 addition |
| Extensions/SDK | Public tools, commands, events, UI, providers, compaction, skills, themes, packages and SDK | Hooks, skills, MCP and self-development, but no equivalent stable general package/SDK surface | Recode decisively |
| First-party integration | Browser/MCP/web access are curated packages and runtime contracts, not yet one guaranteed public distribution | Built-in Firefox browser and stdio MCP with setup/config import | jcode out of box; deployed Recode browser is deeper and multi-engine |
| Browser safety/capability | Guarded refs, target identity, dialogs, isolated downloads/uploads, diagnostics, profiles and existing-session consent | First-party Firefox tool with setup/status and common actions | Recode package capability stronger; jcode onboarding simpler |
| MCP transport | Package adapter can expose broader MCP integrations | Built-in shared/per-session manager, currently stdio only | Recode potential breadth; jcode coherent default |
| Provider breadth | Mature Pi provider APIs plus Recode OAuth/open-provider support | Broad native and OpenAI-compatible profiles | Rough tie |
| Provider troubleshooting | Settings and provider-specific errors, but no unified doctor | `provider-doctor`, coverage, `auth-test`, account/provider commands | jcode decisively easier |
| Authentication UX | Multiple OAuth/API flows and secret-safe login assistance | Headless/two-step login, account switching, auth tests and provider profile creation | jcode more integrated |
| Project trust | Explicit trust before loading local executable settings/resources | Permission and ambient approval surfaces, plus destructive gate | Recode stronger project-resource boundary; jcode stronger approval UX |
| Local control plane | Authenticated IPC, private endpoints, filtered child env, owner generations and turn leases | Persistent daemon with broad server protocol | Recode has stronger documented fail-closed local invariants |
| Sandbox | Same-user host privilege; no sandbox claim | Same-user host privilege; broad safety design remains incomplete | Neither |
| Catastrophic commands | Deterministic root/home/credential/device/fork-bomb denial | Destructive command gate | Both have real gates; neither is containment |
| Background jobs | Maestro full sessions and Telegram durable queue | Integrated background commands, ambient scheduler, wake/notification paths | jcode easier and broader |
| Notifications | Completion queue reaches Aizen; no general desktop/system notification center | Notification subsystem and session/ambient messages | jcode |
| Remote/channel use | Durable Telegram gateway for one authorized private user; no pairing/device enrollment | `pair` command and iOS/remote plans; broader native mobile product is still coming | Recode has a working channel; both lack a complete general remote-security product |
| Permissions UX | Interactive owner and generation protect mutations; project trust is explicit | `permissions` command and ambient pending requests | jcode easier to inspect/respond; Recode lifecycle authority stronger |
| Diagnostics | Generic read-only `recode doctor` groups release, installation, settings, provider auth, dynamic package/runtime, MCP, Maestro, memory and LSP evidence | Provider doctor, auth tests, browser status, debug commands | Recode broader product snapshot; jcode deeper guided provider/auth troubleshooting |
| Installation | Exact npm artifact and builders exist; public trusted publication/self-update remain disabled | One-line platform installers, checksums and official binaries | jcode decisively easier |
| Update/rollback | Fail-closed identity, installation classification, confirmation and rollback receipt | Integrated binary update and self-dev reload | Recode safer in source preservation; jcode complete for end users |
| Windows service UX | Native task and Job Object; this checkpoint fixes visible console and deadline mismatch | Background daemon is a primary product path | jcode still smoother |
| Cross-platform | Windows/Linux Node proven; Bun/ARM/Termux matrix incomplete | Published Linux/macOS/Windows/FreeBSD assets and Termux instructions | jcode |
| TUI | Mature extensible terminal UI and Maestro board | Side panels, Mermaid, info widgets, custom scrolling and fast client | jcode built-in experience; Recode customization |
| Voice | Package/extension opportunity, no default | `dictate` workflow | jcode |
| Telemetry | Recode does not present a comparable default telemetry notice | Anonymous telemetry is enabled with documented `JCODE_NO_TELEMETRY=1` opt-out | Recode simpler privacy posture; jcode more explicit than silent telemetry |
| Maintainability | Smaller TypeScript workspaces, fast checks, extensibility avoids core rebuilds | Large Rust workspace; README reports about one-minute cached incremental build | Recode |
| Documentation accuracy | Operational docs are strong; public identity/install docs still need consolidation | Extensive docs, but some README claims exceed architecture status | Neither |

## What Recode does not provide easily enough

### P0 — User-visible blockers

1. **Instant, invisible background service startup.** A user should never see a service console or receive a timeout for a session that later appears online.
2. **One product doctor.** `recode doctor` should combine version/provenance, provider/auth/model readiness, extension contracts, browser/MCP health, Kioku/LSP state and Maestro health with redaction.
3. **A straightforward session entry path.** Add a searchable cross-workspace picker and `recode maestro attach <id>` rather than requiring users to understand board versus RPC commands.
4. **A coherent installer/updater.** The exact artifacts are credible, but users still cannot install/update from a reviewed Recode channel with the ease of jcode's one-line installer.
5. **Guaranteed first-party integration readiness.** Web, MCP and browser packages work, but package updates can reintroduce source-only loading and the public browser licensing/distribution boundary remains unresolved.

### P1 — Product completeness

6. **Unified notifications and background inbox.** Completion delivery exists internally but is not a general user-facing notification/job surface.
7. **Provider/account troubleshooting.** Model mismatch and auth problems require reading errors/settings instead of running a guided diagnostic.
8. **Remote enrollment and authorization.** Telegram uses manual bot/user configuration; there is no pairing, scoped device authorization, revocation or multi-channel approval UI.
9. **Semantic retrieval option.** Kioku is governed and auditable but lacks optional hybrid lexical/vector ranking.
10. **Integrated approval center.** Recode has strong owner checks but no consolidated view for pending browser/MCP/tool/channel approvals.

### P2 — Optional parity, not core blockers

- Mermaid/side panel, voice, desktop and richer widgets.
- General recursive swarms. Recode should preserve bounded workers by default.
- Automatic memory extraction/consolidation. This must not bypass Teach/Cardinal admission.
- Self-modifying core workflows. Recode's extension model is cheaper and safer for most customization.

## C4 decisions

### Adopt

- Persistent service/client latency discipline with cold and warm endpoints published separately.
- Shared immutable provider/catalogue, verified package metadata, stable schemas and rebuildable read-only indexes.
- Product-wide doctor and readiness UX.
- Searchable cross-workspace/session picker and direct attach.
- Unified background completion/notification inbox.
- Optional hybrid semantic Kioku retrieval under existing admission/provenance rules.
- Pairing/revocation/scoped remote authorization before expanding Telegram or remote clients.

### Preserve

- One lifecycle authority and one supervisor.
- Separate full-session processes until sharing can be proven not to leak credentials/transcripts/workspaces.
- Exact edit and first-class LSP.
- Stable extension/package/SDK contracts.
- Bounded named workers rather than unrestricted recursive swarms.
- Markdown memory authority and explicit Creator admission.
- Fail-closed owner generations, workspace receipts, turn leases and local IPC authentication.

### Reject or defer

- Performance claims based on unmatched endpoints.
- Automatic worktree creation/merge/cleanup.
- Silent memory extraction.
- Automatic commits.
- Desktop/voice/Mermaid work before doctor, session entry, startup and distribution are coherent.

## V2 implementation order

1. Complete the Windows service invisibility/deadline fixes in this checkpoint.
2. Add one product-wide diagnostic/doctor command by composing existing readiness sources.
3. Add direct Maestro attach and a searchable cross-workspace picker.
4. Retain one- and ten-session latency/memory artifacts; do not rerun failed broad probes blindly.
5. Execute O9 in measured order: verified package/schema cache, provider catalogue, Kioku index, then explicit MCP/browser shared-service ownership.
6. Add optional hybrid Kioku ranking.
7. Finish signed channel/update metadata and stable installer UX.

## V3 entry plan

1. Generalize the existing Telegram gateway behind channel-neutral pairing, scopes, revocation, replay protection and approval delivery.
2. Add a unified notification/background inbox.
3. Expose replaceable remote/IDE/web clients over the same lifecycle/session authority.
4. Add package trust tiers/signing and a curated registry.
5. Evaluate side panels, Mermaid, voice and desktop clients as optional packages or clients.

## Checkpoint conclusion

Recode is no longer behind because it lacks lifecycle correctness. It is behind because users still have to assemble and understand too many correct subsystems themselves. The next competitive advantage comes from making those subsystems feel like one product while preserving the stronger Recode boundaries.
