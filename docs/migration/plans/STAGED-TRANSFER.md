# Staged Standalone Transfer Plan

Recode will first complete the [pre-transfer documentation closure](DOCUMENTATION-CLOSURE.md), then transfer the coding-agent package, followed by its dependency packages and repository infrastructure in controlled slices. This replaces the assumption of one bulk source copy. It does not authorize copying, installation, registry access, publication, tags, remotes, or workflow execution.

## Fixed decisions

- Standalone package identities use `@reitaard/recode-*`, not `@reitaard/repi-*`.
- Public packages begin on one synchronized fixed-version train.
- The first version is the Creator-approved **custom bootstrap version**. It is not derived from upstream `0.83.x`/`0.84.x`, and `0.84.0-beta.1` is deprecated and forbidden.
- The bootstrap value is fixed at `0.1.0` before manifest/package identity rewriting; do not substitute an inherited or guessed version.
- Upstream source version/commit remains provenance metadata, not Recode SemVer.
- Coding-agent is transferred first as source, but it cannot be build-certified until its internal dependency packages and minimal root workspace are transferred and renamed.
- No old package identity is published as a compatibility package unless separately approved.

## Canonical package-name map

| Source identity | Standalone identity |
|---|---|
| `@reitaard/repi-coding-agent` | `@reitaard/recode-coding-agent` |
| `@reitaard/repi-agent-core` | `@reitaard/recode-agent-core` |
| `@reitaard/repi-ai` | `@reitaard/recode-ai` |
| `@reitaard/repi-tui` | `@reitaard/recode-tui` |
| `@reitaard/repi-telemetry` | `@reitaard/recode-telemetry` |
| `@reitaard/repi-orchestrator` | `@reitaard/recode-orchestrator` |
| `@reitaard/repi-storage-sqlite-node` | `@reitaard/recode-storage-sqlite-node` |

Package directory names remain unchanged initially. Renaming directories adds no public value and would complicate provenance review.

## Remaining phases and slices

The four documentation-closure slices and transfer/certification Slices 1–6 are complete. The plan contains **7 phases and 17 bounded slices** in total. Coding-agent has been copied, rewritten to standalone identity, and statically audited; it becomes runnable/certifiable only after the dependency and root-bootstrap slices in Phases 3–4.

### Phase 1 — freeze the coding-agent-first boundary (3 slices)

1. **Bootstrap identity record — complete**
   - record the approved standalone bootstrap version `0.1.0`;
   - update the versioning plan to prohibit deprecated/inherited versions;
   - freeze the seven-name `@reitaard/recode-*` map and fixed train;
   - record SQLite as public in the first seven-package train at `0.1.0`.

2. **Coding-agent path ledger — complete**
   - derive a package-scoped ledger from the frozen 1,767-row source ledger;
   - preserve the current coding-agent totals as review evidence: 794 tracked rows = 615 transfer, 119 rewrite, 23 quarantine, 1 regenerate, 36 exclude;
   - replace generic rewrite rows with an explicit destination map for the already-written 24 owner docs;
   - ensure `docs/docs.json`, broken `server/create-harness`, subprocess subagent, stale screenshots, generated output, and external/platform examples remain excluded or quarantined as classified.

3. **Coding-agent copier and dry run — complete**
   - extend the copier with an exact approved prefix/phase selector rather than copying all 1,243 transfer rows;
   - refuse paths outside `packages/coding-agent/` for this phase;
   - refuse existing rewritten docs and changelogs unless byte-identical or individually approved as skip-only;
   - record file count, byte count, collisions, and source cleanliness;
   - obtain explicit Creator approval for the coding-agent copy.

**Coding-agent source-transfer gate — passed:** explicit approval copied and byte-verified 615 files, followed by raw provenance checkpoint `ac99921`.

### Phase 2 — transfer and neutralize coding-agent (3 slices)

4. **Raw coding-agent transfer — complete**
   - make a clean checkpoint;
   - copy only approved `transfer` rows;
   - do not overwrite current README/docs;
   - verify every copied byte against the source commit and ensure no unlisted path entered;
   - create a local provenance checkpoint.

5. **Coding-agent identity rewrite — complete**
   - rename its manifest to `@reitaard/recode-coding-agent`;
   - replace internal package dependencies with their new Recode identities and the exact bootstrap range policy;
   - rewrite runtime package-name lookups, CLI/package metadata, shrinkwrap owner inputs, examples, and product-facing imports;
   - preserve `.pi`, `PI_*`, `pi.*`, or old identities only where verified compatibility schemas/configuration require them;
   - keep self-update, publication, install-lock, release endpoints, and remote mutation fail-closed.

6. **Coding-agent static audit — complete**
   - verify export map and executable-only `./rpc-entry` boundary;
   - scan stale package identities and machine/private paths;
   - verify assets/fixtures and excluded/quarantined paths;
   - run syntax/static checks possible without unresolved workspace dependencies;
   - explicitly report that build/runtime certification remains blocked on Phases 3–4.

### Phase 3 — transfer dependency packages (4 slices)

7. **Foundation — complete:** telemetry plus AI transferred, renamed, and statically audited.
   - telemetry: 12 rows = 10 transfer + 2 rewrite; 41,103 transfer bytes; derived ledger SHA-256 `61e468ee7b7bb05f13d71be8ad6ae14ea72bb7241849bbefbe200c3f48e7013d`;
   - AI: 372 rows = 370 transfer + 2 rewrite; 2,684,905 transfer bytes; derived ledger SHA-256 `72feb8c3cf8e085565722a46e6aa8b3fca437ba750529dd60084d5187b5df19b`;
   - raw checkpoints: telemetry `298c353`, AI `ed15fb0`; identity/static checkpoint: `99857a1`;
   - both packages use `@reitaard/recode-*@0.1.0`, deterministic local compilation defaults, and private/throwing publication gates;
   - inherited default `pi.dev` Radius service behavior is disabled; Radius now requires an explicit compatible gateway;
   - installation, build, tests, and package certification remain blocked until root workspace infrastructure and dependencies are transferred.
8. **Runtime — complete:** Agent core transferred, renamed, and statically audited while preserving V3 versus isolated Session V4 boundaries.
   - Agent core: 107 rows = 97 transfer + 4 rewrite + 6 exclude; 883,436 transfer bytes; derived ledger SHA-256 `3d41f041b25bd522954b4264c476f308459679bdab2b558bbc75733dd0692b50`;
   - raw checkpoint `4d0e2a8`; standalone identity/static checkpoint `2993ce2`;
   - package/import identity is `@reitaard/recode-agent-core@0.1.0`; publication remains private and throwing;
   - active V3 AgentHarness and isolated Session V4 exports remain separate; inactive V4 application-lifecycle tests were not activated;
   - six superseded design documents remain excluded;
   - telemetry Markdown regeneration remains deferred until the root TypeScript runner exists, as required by the telemetry-schema plan.
9. **Interface — complete:** TUI transferred and renamed, with all four uncertified native prebuilds excluded from active package contents.
   - TUI: 93 rows = 85 transfer + 4 rewrite + 4 quarantine; 1,136,872 transfer bytes; derived ledger SHA-256 `76c2f9e9ebe8701f57482a9edb6332f79e65bab6e4fb8bd5ed502919873d8884`;
   - raw checkpoint `c7cc3e0`; standalone identity/static checkpoint `bfb3b3f`;
   - package identity is `@reitaard/recode-tui@0.1.0`; publication remains private and throwing;
   - package contents exclude all `.node` files and native source/build directories; JavaScript fallback is the only currently certifiable behavior;
   - retained `REPI_TERMINAL_*`, `RepiTerminal*`, and `PI_*` names are documented compatibility contracts rather than product identity.
10. **Services/storage — complete:** orchestrator and SQLite transferred, renamed, and statically audited; both remain in the initial `0.1.0` train subject to certification.
   - orchestrator: 48 rows = 46 transfer + 2 rewrite; 362,241 transfer bytes; ledger SHA-256 `ec7c94f2817bcc4ffedf9709e793dec918d491f076e8d571bc63f19e7e66cb2a`;
   - SQLite: 18 rows = 16 transfer + 2 rewrite; 57,180 transfer bytes; ledger SHA-256 `e40918527960fafc2bec1383084a40939ee109333e3f5ce011f91f4a1d665c3a`;
   - raw checkpoints: orchestrator `217314a`, SQLite `3f95a08`; identity/static checkpoint `6aa52a3`;
   - package identities are `@reitaard/recode-orchestrator@0.1.0` and `@reitaard/recode-storage-sqlite-node@0.1.0`; publication remains private and throwing;
   - Radius has no inherited default endpoint and activates only with explicit compatible endpoint plus credentials;
   - orchestrator completion restart recovery remains visibly uncertified for Phase 5 repair; SQLite migration copying now clears stale migration output.

Each slice uses its own prefix ledger/dry run, preserves staged owner documentation, rewrites manifests/internal imports, and creates a local checkpoint. Known defects remain visible rather than silently removed.

### Phase 4 — minimal repository bootstrap (2 slices)

11. **Root workspace/build identity — complete; shrinkwrap pending successful build**
   - established `recode-workspace@0.1.0` with exactly seven workspaces and deterministic dependency-order build orchestration;
   - added standalone TypeScript aliases, Node `>=22.19.0`, formatting policy, npm safety defaults, license, and repository exclusions;
   - added a read-only identity check enforcing seven `@reitaard/recode-*` packages at `0.1.0`, internal `^0.1.0` ranges, and private/throwing publication gates;
   - excluded inherited root prose and governance files already replaced here;
   - approved `npm install --ignore-scripts` generated the standalone lockfile; coding-agent shrinkwrap regeneration remains pending a successful package build and must be generated rather than copied.

12. **Safe local automation — complete**
   - retained only deterministic build/test/check entry points and the reviewed TypeScript-relative-import checker;
   - added a migration-safety check that fails if mutation-oriented install/release/publish/binary scripts appear or inherited active repository/Radius endpoints return;
   - CI, release, publish, update, binary, announcements, tags, pushes, install helpers, and remote mutations remain absent/inactive;
   - canonical workspace graph is exactly the seven-package fixed train; publication remains disabled in every package.

Phase 4 is complete. The first lifecycle-script-disabled install succeeded; the first build now provides Phase 5 defect evidence rather than a structural bootstrap blocker.

### Phase 5 — repair and deterministic certification (2 slices)

13. **Known-defect repair — active**
   - keep the excluded `AgentHarness.create` adapter out unless deliberately repaired/adopted;
   - repair AI nullable-array generated-validator compatibility;
   - align the direct Smithy type dependency with the AWS client's resolved type family and repair the Codex fetch-body typing mismatch found by the first build;
   - approve and apply an `undici` security update from `8.5.0` before certification; the production audit currently reports one high-severity direct finding;
   - repair or explicitly limit orchestrator completion restart recovery;
   - regenerate Agent telemetry schema and add drift checks.

14. **Build/test/import certification**
   - fresh install with no inherited dependencies/output;
   - package builds and deterministic credential-free tests;
   - coding-agent Aizen/legacy/worker/memory/session/gateway/Doctor/update gates;
   - public export/import and retained example compilation;
   - settings/session/RPC/JSON/telemetry drift checks;
   - no local-model pulls or live provider credentials by default.

### Phase 6 — package and platform certification (2 slices)

15. **Package-content/install certification**
   - inspect `npm pack --dry-run` and unpacked tarballs for every intended public package;
   - verify renamed dependency ranges, assets, executable permissions, shrinkwrap, runtime `package.json` resolution, and isolated local-tarball installation;
   - prove no `repi-*` dependency leaks except approved compatibility identifiers.

16. **Platform/native/external boundaries**
   - certify supported OS/Node/terminal paths;
   - either reproducibly rebuild/prove TUI native artifacts or omit them;
   - keep network providers, Telegram, Maestro native services, Termux, containers, custom providers, and external examples opt-in and separately evidenced.

### Phase 7 — public repository and release readiness (1 slice)

17. **Final authority handoff**
   - approve license, security channel, Code of Conduct contact, support/contribution policy, maintainers, and fork-safe pinned CI;
   - finalize release identity/provenance and the custom bootstrap version everywhere;
   - inspect complete documentation/archive coverage;
   - remove migration-only material only after Creator approval;
   - make a final local certified checkpoint.

Remote repository creation, push, npm publication, tags, releases, and dist-tag mutation remain separate explicit approvals after this phase.

## Current remaining milestones

From checkpoint `cb56e41`, package transfer and root bootstrap are complete through Slice 12. The approved first install added 306 packages with lifecycle scripts disabled and generated the standalone lockfile. Initial build evidence:

- TUI and telemetry compile after aligning the workspace target/import-rewrite configuration with current source syntax;
- AI compilation is blocked by an AWS/Smithy direct type-version mismatch and a fetch-body typing mismatch;
- production audit reports one high-severity direct `undici@8.5.0` finding; no automated fix or version change was applied;
- later package builds, shrinkwrap generation, tests, and Slices 13–17 remain pending.
- Slices 11–12 transfer minimal root infrastructure;
- Slices 13–17 repair, certify, package, and complete public-readiness handoff.

The plan remains 17 total transfer/certification slices; completed slices are not counted again as remaining work.

These are bounded review slices, not time estimates. A failed gate adds a repair slice rather than being waived.

## Ordering rationale

Coding-agent-first preserves the Creator's requested product focus and makes its identity rewrite concrete before supporting packages arrive. Dependency packages follow before root bootstrap so inherited workspace/release identity cannot activate accidentally. Root installation/build occurs only after every internal package has its final name and synchronized custom bootstrap version. Publication remains last.
