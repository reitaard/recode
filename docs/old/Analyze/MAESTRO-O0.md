# Maestro O0 contract and inherited-behavior report

**Date:** 2026-07-28

**Frozen inputs:** Recode `a82bf7608d57e6295fb22287b025a1a093ec258e`; upstream Pi `c820aa26fe0907e053e881a957722693fc094c9c`; Phase 4A reference `8ef5f64fe735e406db2eeb1ef3cf4effc420d67d`; Hermes `5b22bd955682a8fc7b07769784c5129e23f53eaf`.

## Frozen product contract

- **Recode Maestro** is the full-session conductor built from the existing `packages/orchestrator`; no second server package is created.
- Canonical service namespace: `recode maestro <command>`.
- Aizen remains the default bare `recode` runtime; explicit form becomes `recode aizen` at O1 entry, when the approved removal of `--aizen` occurs.
- Direct private worker chats use `recode worker <levi|mayuri|shiori>` and stable aliases `--levi`, `--mayuri`, `--shiori`. Direct chat routing must not invoke an extra Aizen model turn.

## Three-way source result

### Current Recode orchestrator

The package already owns the correct substrate: one RPC child per full session, first-state synchronization, event forwarding, extension UI forwarding, persisted instance summaries, Radius integration, and restart status normalization.

Characterized behavior:

- Spawn does not become `online` until the child answers `get_state` and optional Radius registration completes.
- RPC responses correlate by generated IDs; ordinary events fan out to subscribers; extension UI requests use one current handler per instance.
- Unexpected exit rejects all pending RPCs, reports exit, marks the live instance `error`, disconnects Radius and removes it from the live map while retaining its persisted error record.
- Explicit stop sends `SIGTERM` and waits without a deadline; the stopped record is then removed rather than retained as a terminal snapshot.
- Restart recovery does not reconnect children: persisted `online` and `starting` records become `stopped`; existing `error` records stay `error`.

Confirmed defects carried into O1–O3:

- RPC requests have no deadline.
- `dispose()` can wait forever after `SIGTERM`; there is no escalation.
- storage writes replace JSON directly rather than atomically and have no backup recovery.
- restart recovery has no PID/process identity verification or durable reconnect.
- the package has no `bin` despite CLI documentation.
- Node spawn used `createRequire().resolve()` against an import-only `./rpc-entry` export, so the Node path failed before spawn. O0 replaces only that resolver with `import.meta.resolve()`/`fileURLToPath()` and retains an injectable spawn seam for characterization.

### Upstream Pi server

Upstream renamed the same package to `packages/server`/`@earendil-works/pi-server` and changed branding, environment names, credential access and Radius names. Its RPC process, supervisor and storage retain the same lifecycle defects. No upstream lifecycle change is selected for porting. The credential API change remains reference material only because importing it would replace Recode identities rather than harden Maestro.

### Phase 4A routing reference

Phase 4A adds a pure injectable request router and a strict target envelope for `local`, `node` and `sandbox`. Only local execution is authorized; unknown fields and non-local targets fail closed before coordinator methods run.

Classification: **full-session-extension, deferred**. The strict parser/router is useful for later remote deployment, but it does not fix O0–O4 lifecycle correctness and must not imply that node or sandbox transport exists. Its pure injected-router pattern may be reused when Maestro command routing is implemented.

## Hermes port mapping

| Hermes contract | Classification | Maestro/Recode mapping |
|---|---|---|
| Public contract version and immutable launch/handle/status/terminal/cancel/result records | direct-port | Versioned TypeScript records with bounded validated inputs and immutable returned snapshots. |
| `PENDING`, `STARTING`, `RUNNING`, terminal, cancel-requested and unknown states | direct-port | Preserve state meanings; map current `online` to `RUNNING` only at the persistence/CLI adapter boundary. |
| Goal/context/metadata/result bounds and duplicate correlation rejection | direct-port | Apply before child creation; correlation uniqueness is scoped to parent session. |
| Capability HMAC tied to an in-process random secret | adapted | Replace with durable instance identity plus generation/ownership verification suitable across Maestro restart. |
| In-process registry and one-hour terminal retention | adapted | Persist terminal snapshots atomically with bounded count/time retention. Never retain live executor objects. |
| `status`, bounded `wait`, idempotent `cancel`, `result` and result hash | direct-port | Preserve observable semantics through process adapters and RPC deadlines. |
| Hermes reconnect unavailable after process restart | full-session-extension | Maestro must verify durable child/process identity and reconnect when safe; otherwise return an explicit terminal/unknown diagnostic without relaunching work. |
| Daemon executor capped at eight children | adapted | Use configurable bounded process admission and bounded concurrently running prompts. |
| Independent iteration budget with consume/refund | adapted | Add per-Aizen/worker turn budget; refund only host-defined non-model bookkeeping equivalents, not arbitrary tool calls. |
| Delegated-child context and subprocess lineage | adapted | Preserve named-worker/full-session lineage and scrub parent-only ownership/workspace variables across child process boundaries. |
| Hermes-specific Kanban environment keys | excluded | Product-specific names are not ported; only the fail-closed lineage invariant is retained. |
| Lease per resolved session ID | direct-port invariant | Serialize mutating prompt/turn ownership by resolved session, not client routing key. |
| Generation/identity-checked idempotent release and session-ID rebind | direct-port | Required for stale-owner safety and session rotation. |
| Bounded idle lease registry | direct-port | Never evict held or contended leases. |
| Lease timeout fails open into concurrent transcript mutation | adapted | Recode fails closed with an explicit recoverable error; simultaneous transcript mutation is never allowed. |
| Hermes in-process `AIAgent` executor | excluded | Existing Recode Aizen/worker and RPC-process adapters remain the execution backends. |

## Effective O0 tests

One consolidated test file covers four high-value behaviors:

1. first state response plus event and extension-UI bidirectional routing;
2. pending-request rejection and exit notification on unexpected child exit;
3. `SIGTERM` stop behavior under a cooperative child;
4. persisted restart normalization without child resurrection.

These tests intentionally document the inherited cooperative-stop behavior; O3 will replace the unbounded wait with deadline/escalation tests.

## O0 gate status

- Existing high-value behavior is reproducible under focused tests.
- Upstream contributes no selected lifecycle implementation.
- Phase 4A target routing is explicitly deferred as a full-session extension.
- Every reviewed Hermes lifecycle/budget/lineage/lease behavior is classified.
- CLI identity is frozen under Maestro.

O0 is complete once final focused tests/checks pass with the Node resolver correction recorded above. O1 may then port the public lifecycle model without importing Hermes execution internals.
