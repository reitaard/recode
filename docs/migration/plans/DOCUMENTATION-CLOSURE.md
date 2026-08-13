# Pre-Transfer Documentation Closure Plan

Finish the standalone documentation set before copying product source. After this closure, implementation, tests, fixtures, runtime assets, and approved configuration can be transferred from the audited source repository through the manifest; inherited prose is not copied over current owner documentation.

This plan does not authorize source transfer, installation, builds, remotes, or publication.

## Meaning of “documentation done”

Pre-transfer documentation is done when:

- every current topic has one explicit owner;
- all useful inherited claims have a moved, excluded, historical, or post-transfer-certification disposition;
- package owner guides exist for every release-path package;
- commands, imports, exports, settings, protocols, platforms, and security claims are either verified against the audited source or clearly marked provisional;
- no inherited README or docs-site file is needed during source copy;
- indexes and local links pass;
- remaining work requires transferred source, generated output, runtime evidence, platform evidence, or Creator-owned governance details.

It does **not** mean release certification. Compilation, generated-schema drift, tarball contents, local installation, platform/native behavior, and final public policy remain post-transfer gates.

## Four closure slices

Status: D1–D4 completed at the pre-transfer documentation checkpoint. Findings were corrected where current evidence permitted; remaining items are listed under post-transfer work below.

### Slice D1 — canonical package-doc audit — complete

Audit the already-written owner docs for Agent, AI, coding-agent, TUI, telemetry, orchestrator, and SQLite as one set:

- terminology and cross-package ownership;
- new intended `@reitaard/recode-*` identities on the approved `0.1.0` bootstrap;
- public versus compatibility APIs;
- known defects and uncertified boundaries;
- no installation/publication availability claims;
- no stale source-repository links or private source imports.

Only fix concrete contradictions or missing routing. Do not expand prose merely to mirror inherited files.

### Slice D2 — operator and contributor-doc audit — complete

Audit root, setup, coding, workers, memory, Maestro, support, contribution, release, update, and security-boundary docs:

- distinguish current migration procedure from permanent operator procedure;
- ensure remote mutation, installation, release, and update remain approval-gated;
- ensure public contributor/security files do not invent contacts, license terms, support promises, or CI behavior;
- ensure the custom version bootstrap and package-name map have one migration owner.

Canonical `SECURITY.md` and `CODE_OF_CONDUCT.md` remain intentionally blocked on Creator-owned contacts/policy; their absence does not block source transfer.

### Slice D3 — archive/coverage closure — complete

Complete the archive and coverage ledgers for operations, analysis, update, benchmark, AgentHarness, and remaining historical groups. Every useful claim must point to a current owner or a specific post-transfer evidence gate. Mark source READMEs/docs as excluded, consolidated, or generated so they cannot overwrite the new documentation.

Do not delete `docs/old/` yet. Deletion occurs only after post-transfer certification and Creator approval.

### Slice D4 — mechanical documentation certification — complete

Run and record:

- canonical local-link check;
- stale identity and machine-path scans;
- duplicate/owner routing review;
- `git diff --check`;
- migration index and coverage completeness review;
- clean working-tree checkpoint.

Produce a concise list of documentation items intentionally deferred to post-transfer certification.

Recorded result: zero canonical broken local links; zero machine-local path hits outside the archive; no predecessor `@reitaard/repi-*` identity remains in package owner docs outside changelog provenance; formatting check passes. Commands and runtime claims are explicitly pre-transfer/provisional where source is absent.

## Post-transfer documentation work that remains valid

After source transfer, documentation changes are limited to evidence-driven corrections:

1. compile documented imports and retained examples;
2. generate Agent telemetry-schema Markdown from typed source;
3. add/check settings, session, RPC, JSON, and telemetry drift tests;
4. correct docs when renamed exports or runtime tests disagree;
5. verify tarball/install commands and package contents;
6. certify or narrow platform/native/external-integration claims;
7. finalize security, conduct, license, maintainer, and repository links after Creator decisions;
8. remove migration/archive material after complete certification and approval.

These are certification and governance tasks, not another inherited-document rewrite.

## Source-copy rule after closure

After D1–D4, use the staged transfer plan and exact ledger:

- copy approved `transfer` source/config/test/fixture/asset rows from `../re.pi`;
- preserve current rewritten documentation and staged changelogs;
- never copy `rewrite`, `exclude`, `quarantine`, or `regenerate` rows automatically;
- use explicit scoped phases, byte/hash verification, collision refusal, and Creator approval;
- leave the source repository unchanged.

“Copy the rest” therefore means copying manifest-approved implementation inputs, not restoring inherited prose, generated output, private material, obsolete packages, unsafe automation, or uncertified binaries.
