# Repository Transfer Plan

The target is a public open-source repository suitable for worldwide contributors, not merely a private source copy. Apply the [public repository readiness plan](plans/PUBLIC-REPOSITORY.md) to documentation, examples, governance, security, CI, licensing, packaging, and launch decisions.

## 1. Close pre-transfer documentation

Completed the four slices in the [documentation closure plan](plans/DOCUMENTATION-CLOSURE.md): canonical package audit, operator/contributor audit, archive/coverage closure, and mechanical documentation certification. Inherited prose is not copied; only evidence-driven corrections remain after source transfer.

## 2. Certify core documentation

Audit the canonical documentation for every release-path package against current exports, source, focused tests, and relevant Git decisions:

- `packages/agent` — README, active AgentHarness, and isolated Session V4 documentation drafted under `packages/agent/`; deterministic telemetry-schema regeneration/check plan is complete, while actual generation and compilation/tests wait for transferred typed source
- `packages/ai` — replacement owner README drafted; bounded no-local-model gate passed 137 tests with one reproducible nullable-array generated-validator failure and 196 credential-gated skips; post-transfer import/build and deterministic/network test separation certification remain
- `packages/coding-agent` — 24 replacement owner documents drafted across all four planned groups; post-transfer source/import/example/protocol drift certification remains, and one isolated unexported upstream Harness adapter is excluded pending repair/adoption
- `packages/tui` — README and direct native build guides drafted under `packages/tui/`; checked-in native prebuilds still require provenance/rebuild and target certification
- `packages/telemetry` — concise generic API documentation drafted under `packages/telemetry/`; post-transfer compilation/tests remain
- `packages/orchestrator` — working CLI/security/workspace boundaries documented under `packages/orchestrator/`; completion restart recovery remains uncertified and package test ownership unresolved
- `packages/storage/sqlite-node` — optional-backend documentation drafted under `packages/storage/sqlite-node/`; it is approved for the initial seven-package `0.1.0` train, while post-transfer example/build/tests, publication wiring, registry availability, and package certification remain

Rewrite inherited, obsolete, or mixed-status package documentation before treating it as Recode authority. The coding-agent's 12,605-line inherited documentation set has a file-by-file consolidation and evidence plan in [CODING-AGENT-DOC-PLAN.md](plans/CODING-AGENT-DOCS.md). Agent, AI, TUI, telemetry, orchestrator, and SQLite documentation have an ordered ownership and acceptance plan in [PACKAGE-DOC-PLAN.md](plans/PACKAGE-DOCS.md). Execute both only against verified source boundaries.

## 3. Complete archive disposition

The archive groups now have explicit deletion-time dispositions in [the archive inventory](inventories/ARCHIVE.md), and the coverage ledger records all groups as checked, moved, old, or platform-pending. Finish the owning package/setup rewrites and platform decisions; do not delete the archive before post-transfer certification and Creator approval.

## 4. Prepare the transfer inventory

Package slices are classified in the [package inventory](inventories/PACKAGES.md); root files in the [root inventory](inventories/ROOT.md); workflow inputs and activation gates in the [workflow inventory](inventories/WORKFLOWS.md); examples in the [examples inventory](inventories/EXAMPLES.md); and runtime assets, generated inputs, fixtures, and native artifacts in the [assets inventory](inventories/ASSETS.md). The exact 1,767-path ledger is summarized by the [copy manifest](inventories/COPY.md), stored in [`manifest/transfer.tsv`](manifest/transfer.tsv), and recorded with hash/counts as a [freeze candidate](plans/MANIFEST-FREEZE.md). Creator approval and a reviewed transfer-only copier remain required. Every source path uses one exact ledger disposition, defined in the [copy manifest](inventories/COPY.md):

- `transfer`;
- `rewrite`;
- `quarantine`;
- `regenerate`;
- `exclude`.

Exclude build output, bundled copies, caches, dependencies, private evidence, machine-local configuration, and obsolete source surfaces.

## 5. Resolve package identity and version lineage

The selected direction is seven new `@reitaard/recode-*` identities on one synchronized fixed train. Use the approved standalone bootstrap version `0.1.0` across all seven intended public packages, including SQLite; `0.84.0-beta.1` is deprecated and forbidden. Verify registry availability only with permission. See the [versioning plan](plans/VERSIONING.md) and [staged transfer plan](plans/STAGED-TRANSFER.md).

## 6. Transfer and rewrite in stages

Use the [17-slice staged plan](plans/STAGED-TRANSFER.md). Slices 1–9 are complete: coding-agent, telemetry, AI, Agent core, and TUI were scoped, transferred, identity-neutralized, and statically audited. Slice 10 orchestrator and SQLite is next, followed by minimal root infrastructure and certification/release files. Each copy requires its own scoped ledger, dry run, and Creator approval. Preserve provenance and leave the source repository unchanged.

Before the first standalone build, synchronize every connected identity/version file listed in the [versioning plan](plans/VERSIONING.md), remove inherited generated/build output, and follow the [from-scratch build procedure](../setup/BUILD.md#first-standalone-build-after-migration). The migration source's current custom version must not become the new release line implicitly.

## 7. Certify the complete repository

After all intended source and documentation are present:

1. compare transferred files with the approved inventory and source commit;
2. cross-check every canonical document against transferred source, public exports, tests, scripts, and Git decisions;
3. cross-check every archived document in `docs/old/` against canonical coverage;
4. resolve every coverage row as moved, excluded, or deliberately retained;
5. run focused package tests, `npm run check`, and `bash ./test.sh`;
6. run link, identity, stale-term, generated-file, package-boundary, and Git-diff checks;
7. verify build, install, release, update, rollback, worker, memory, and Maestro documentation against the transferred implementation;
8. report all unrun platform or artifact certifications explicitly.

The repository is not certified while a useful archived claim remains unclassified or a canonical claim lacks implementation evidence.

## 8. Prepare public collaboration

Pre-launch `CONTRIBUTING.md` and `SUPPORT.md` drafts plus governance, security, conduct, and community-template decision plans now exist. Before public launch, approve the repository/contact/license/maintainer choices; create canonical `SECURITY.md` and `CODE_OF_CONDUCT.md`; then create fresh issue/PR forms if useful. Make default CI safe for untrusted forks and credential-free. Complete license/attribution review and ensure retained examples form a maintained onboarding path. Do not activate inherited governance automation.

## 9. Remove migration material

Only after Step 7 passes and the Creator approves deletion:

- delete `docs/old/`;
- delete `docs/migration/` in full after moving any permanent policy to its owning documentation;
- remove temporary evidence and transfer notes;
- rewrite `docs/project/CURRENT.md` as normal product state or remove it if unnecessary;
- remove migration wording from `README.md`, `AGENTS.md`, and indexes;
- rerun the complete documentation and repository checks.

The final standalone repository must contain only current product documentation, approved TODOs, source, tests, examples, and required operational files. Git history provides historical recovery; obsolete documentation does not remain in normal files.

## 10. Authority handoff

After final certification and cleanup, present the complete diff and evidence summary. Create the first checkpoint commit only with Creator approval. From that checkpoint onward, this repository becomes the Recode harness authority and the former repository is reference history only.
