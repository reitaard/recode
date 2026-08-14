# Future Possibilities

This file preserves useful product ideas without representing them as current functionality, approved work, architecture, or schedule.

## Status

Everything here is **unapproved** unless it is moved into an owning `TODO.md` by an explicit Creator decision. Names, package boundaries, implementation order, and milestones are intentionally unfrozen.

Current behavior belongs in package and feature documentation. Approved work belongs in focused TODOs. Historical plans remain available only through Git history.

## Candidate capabilities

### Durable scheduled work

- Persistent schedules and background jobs.
- Explicit time, token, action, and cost budgets.
- Truthful pause, continuation, completion, cancellation, and failure states.
- Restart recovery without duplicating accepted side effects.
- User-visible completion and failure inboxes.

Prerequisites: certified Maestro recovery, idempotency contracts, durable state, cancellation, observability, and notification ownership.

### Sources and richer retrieval

- Session- or project-scoped file, URL, and text references.
- Cheap metadata injection with explicit lazy content resolution.
- Provenance and untrusted-context labels for resolved external content.
- Optional semantic retrieval for Kioku without replacing Markdown authority or Cardinal review.

Prerequisites: source trust policy, bounded context costs, deletion/update semantics, secret rejection, and deterministic lexical fallback.

### Additional channels and devices

- A local web or desktop client.
- Additional authenticated messaging channels.
- Mobile/device nodes and notifications.
- Voice input/output and optional wake-word operation.

Prerequisites: enrollment, authentication, revocation, replay protection, channel-specific authorization, rate limits, auditability, and manual recovery. Telegram's current adapter does not imply approval for a general multi-channel architecture.

### Restricted delegation

- Typed specialist results, stable run identities, and explicit budgets.
- Restricted worktrees or sandbox backends for untrusted/delegated roles.
- Cancellation propagation, recursion/depth limits, and cost attribution.
- Durable delegation only where restart and duplicate-delivery behavior is proven.

Prerequisites: preserve current named-worker semantics, keep workers read-only by default, and do not turn workers into operating-system processes merely to satisfy an old plan.

### Advanced development surfaces

- Editor or ACP integration.
- Debug Adapter Protocol support.
- Persistent Python or JavaScript kernels.
- Rich canvas or visual workspaces.
- Broader browser-assisted workflows.

Prerequisites: explicit ownership, isolation, lifecycle cleanup, protocol validation, permission boundaries, and focused tests. Existing LSP and browser capabilities should be extended rather than duplicated.

### Deployment and fleet operation

- Remote service enrollment and authorization.
- Multiple host/device status and control.
- Fleet-oriented diagnostics and update policy.

Prerequisites: a threat model beyond the current single-user/current-host boundary, secure credential storage, identity rotation, rollback, transport authentication, and platform certification.

## Persistent design constraints

Any adopted capability should preserve these verified directions unless a later decision explicitly replaces them:

- one shared AgentHarness execution boundary;
- one Maestro full-session supervisor;
- Aizen as the main coding agent and Manager;
- named workers as bounded specialists, not automatic fallback or retry machinery;
- Markdown as Kioku's durable authority and Cardinal as its admission boundary;
- authenticated remote/channel exposure;
- explicit trust labels for external or recalled context;
- no silent repetition of non-idempotent side effects;
- deterministic mechanisms for mechanical work and models for judgment.

## Deliberately not preserved from the old JARVIS plan

The following are not current commitments:

- a package named `packages/assistant`;
- the old numbered phase order;
- SQLite as a universal application-state architecture;
- a particular first GUI/channel choice;
- a promised scheduler, voice system, mobile node, kernel, DAP, or swarm;
- extraction of working memory or LSP code merely to match a proposed service diagram;
- claims that host-authoritative operation is safe for untrusted channels or delegated roles.

## Admission rule

Before moving an idea into active work:

1. The Creator explicitly approves the capability and intended outcome.
2. Current source and user needs are reviewed afresh; this file is not sufficient design evidence.
3. The owning package or subsystem is identified without creating a duplicate runtime, supervisor, transcript authority, or memory path.
4. Security, persistence, cancellation, recovery, platform, and compatibility boundaries are written down.
5. A focused TODO records deliverables and exit gates.
6. Only implemented and verified behavior moves into canonical feature documentation.
