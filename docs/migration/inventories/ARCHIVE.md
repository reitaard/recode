# Archive Disposition Inventory

The files under `docs/old/` are preserved evidence from the former repository. This inventory assigns a deletion-time disposition to each logical group. It does not authorize deletion.

Disposition terms:

- **covered** — useful current claims have a canonical owner or an explicit migration inventory decision;
- **historical only** — chronology, measurements, plans, or external comparisons may remain in Git history but must not enter current product docs;
- **pending certification** — useful operational guidance cannot be finalized until a stated runtime/platform/release gate passes.

## Root archive

| File | Disposition | Canonical owner or reason |
|---|---|---|
| `root/AGENTS.md` | covered | Current repository authority is root `AGENTS.md`; coding/testing/documentation rules live under `docs/coding/`. Inherited contribution, tmux, changelog, and release instructions are not copied as policy. |
| `root/OPERATIONS.md` | covered, with release gates pending | Identity and safe-operation rules are in current repository policy; build/release/update behavior is under `docs/setup/` and migration workflow/root inventories. Any command remains provisional until transferred scripts pass certification. |
| `root/README.md` | covered | Product routing is in root `README.md`, `docs/project/ABOUT.md`, and feature/package maps. Inherited Pi promotion, contribution, sharing, and package claims are excluded. |
| `root/Current.md` | covered | Current migration truth is `docs/project/CURRENT.md`; old recommended migration order and non-production adapter plan are superseded by verified Aizen/AgentHarness state. |
| `root/CONTRIBUTING.md` | covered/historical | Source-project contribution gate and philosophy are rejected; the new root `CONTRIBUTING.md` is a Recode-owned pre-launch draft, with final contribution-license/conduct decisions tracked separately. |
| `root/rebuild-SKILL.md` | covered, with platform/release gates pending | Workflow choices were checked against current scripts; canonical setup docs and migration workflow inventory own safe behavior. It is not installed as a skill. |
| `root/RELEASE_NOTES.md` | historical only | Version-specific release prose; new release notes require current source/tag evidence. |
| `root/SECURITY.md` | covered pending final rewrite | Verified trust/reporting requirements are captured in the security-policy plan; canonical contact, supported versions, and telemetry/release scope still require approval. Inherited contacts and scope are not adopted. |
| `root/tui-plan.md` | covered | Implemented renderer/layout behavior is owned by TUI source/tests and the package documentation plan. Unimplemented future uses are not commitments. |

## Architecture archive

| File/group | Disposition | Canonical owner or reason |
|---|---|---|
| `docs/AGENTHARNESS.md` | covered | Active V3 AgentHarness boundary is classified in the package inventory; final package contract is scheduled in the package-doc plan. |
| `docs/AGENT_RUNTIME_INSPECTION.md` | covered | Runtime observations were checked against current Agent/coding-agent source and tests; chronology and superseded recommendations remain historical. |
| `docs/AGENT_ORCHESTRATION_PLAN.md` | covered | Named workers and Maestro now have separate canonical owners; rejected combined orchestration ideas do not return. |
| `docs/DELEGATION_SPIKE.md` | covered | Stable named-worker behavior, IDs, memory role, timeout, retry, and fallback boundaries are current worker docs/inventories. Spike chronology is historical. |
| `docs/ARCHITECTURE_SOURCES.md` | historical only | External comparison bibliography is non-authoritative; future architecture research requires fresh source verification. |
| `docs/JARVIS_BUILD_PLAN.md` | covered | Current implemented boundaries are routed to owners; unapproved possibilities are narrowly retained in `docs/project/FUTURE.md`; inherited phases and commitments are rejected. |
| `docs/RECODE_BUILD_RELEASE.md` | covered, with release gates pending | Current setup docs and root/workflow/asset inventories own the verified release boundary. No old publication instruction is authoritative. |

## Update archive

| File | Disposition | Canonical owner or reason |
|---|---|---|
| `update/README.md` | historical only | Project diary routing, not a product contract. |
| `update/CONTEXT.md` | covered | Durable identity, worker, Maestro, memory, release, and updater facts were checked and routed to current topic owners. Version checkpoints and machine/session context remain historical. |
| `update/DECISIONS.md` | covered | Current decisions are represented in project design, worker and Maestro docs, setup policy, and migration exclusions. Pending historical decisions are not approved work. |
| `update/PLAN.md` | historical only after extraction | Completed and superseded phase sequencing is not retained; still-valid safety/release requirements are represented in current inventories and setup docs. |
| `update/LOG.md` | historical only | Chronological work log and version checkpoints. Consequential current claims require source/test evidence instead. |
| `update/orchestrator.md` | covered | Implemented Maestro contracts and explicit rejected/deferred behavior are classified in current Maestro docs and package inventory. |

## Analysis archive

| File/group | Disposition | Canonical owner or reason |
|---|---|---|
| `Analyze/COMPARE.md`, `JCODEAUDIT.md`, `REPIAUDIT.md` | historical only | Point-in-time external/product comparisons. Do not preserve rankings or parity claims without a new bounded comparison. |
| `Analyze/EXTENSIONAUDIT.md` | historical only after ownership extraction | Installed-package measurements are machine/version specific. Current package boundaries live outside this repository or in coding-agent package policy. |
| `Analyze/IMPLIMENT.md` | historical only | Implementation ledger and phase chronology; current completed behavior was independently checked. |
| `Analyze/IMPLIMENTED.md` | historical only | Empty file; no claim to migrate. |
| `Analyze/PLAN.md`, `PRODUCTION-ROADMAP.md`, `SHORTCOMINGS.md` | covered/historical | Implemented boundaries were independently classified; useful unapproved possibilities were admitted only to `project/FUTURE.md`. Old priorities, SLOs, phase order, and commitments are rejected as authority. |
| `Analyze/MAESTRO-O0.md`, `MAESTRO-O3-CHECKPOINT.md` | covered | Current Maestro implementation/tests and known recovery defect outrank checkpoint claims. Hermes comparisons remain historical. |
| `Analyze/evidence/**` | historical only | Machine/version-specific benchmark and deployment JSON. Preserve provenance until cleanup; do not use as current performance or release evidence. Profiling scripts, not old outputs, are the reproducible owner. |

## Package and platform archive

| File/group | Disposition | Canonical owner or reason |
|---|---|---|
| `packages/orchestrator/README.md`, `CHANGELOG.md` | covered/preserve provenance | Current source package README will be rewritten; changelog transfers as provenance but is not a current contract. |
| `scripts/README.termux.md` | pending platform certification | Current Termux scripts/workflow were inspected, but no Android/Termux artifact install was run. Retain only as evidence until a rewritten platform guide passes that gate. |

## Claims deliberately not promoted

The archive does not establish current authority for:

- old performance numbers, SLOs, package parity, or production-readiness rankings;
- old VPS/deployment state or installed-version state;
- inherited release branches, baselines, repository names, tags, or version targets;
- future voice/mobile/kernel/DAP/scheduler/swarm/multi-channel work;
- automatic worktree creation, absent Maestro routing, crash-safe completion recovery, or sandboxing;
- source-project governance, secrets, labels, contribution rules, or external-service ownership;
- old updater strategies that conflict with current fail-closed package identity and release policy.

## Pre-transfer closure

Root operations, AgentHarness architecture, update diaries, analysis/roadmap material, benchmark evidence, package/platform notes, and governance files now have explicit covered or historical dispositions above and in the coverage ledger. No archived file is required as normal product documentation or as a source-copy input. Remaining reliance is evidence-only until transferred implementation can be certified.

## Remaining archive-removal blockers

Archive disposition is closed for transfer purposes. Physical removal remains blocked by:

1. post-transfer certification of the completed package and coding-agent documentation rewrites;
2. standalone security, build, update, and release identity certification;
3. Termux/native/platform gates or explicit omission decisions;
4. post-transfer build/test/link/stale-identity checks;
5. a final search proving every current document no longer relies on `docs/old/` for normal operation;
6. Creator approval to delete the archive and this migration directory.
