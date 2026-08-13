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
10. **Services/storage:** transfer and rename orchestrator and SQLite; both participate in the initial public `0.1.0` train after certification.

Each slice uses its own prefix ledger/dry run, preserves staged owner documentation, rewrites manifests/internal imports, and creates a local checkpoint. Known defects remain visible rather than silently removed.

### Phase 4 — minimal repository bootstrap (2 slices)

11. **Root workspace/build identity**
   - transfer only required root manifests/configuration and deterministic build/check helpers;
   - rewrite root name, workspace graph, TypeScript aliases, Node floor, package names, custom bootstrap version, and internal ranges together;
   - exclude inherited root prose and governance files already replaced here;
   - regenerate the lockfile and coding-agent shrinkwrap only through approved deterministic commands, never by copying dependency/build directories.

12. **Safe local automation**
   - transfer deterministic test/build scripts in disabled/read-only form;
   - keep CI, release, publish, update, binary, announcements, tags, pushes, and remote mutations inactive;
   - define one canonical workspace/build graph and a separate approved publication graph.

At the end of Phase 4, the repository should be structurally capable of a first dependency install/build, subject to explicit approval for installation.

### Phase 5 — repair and deterministic certification (2 slices)

13. **Known-defect repair**
   - keep the excluded `AgentHarness.create` adapter out unless deliberately repaired/adopted;
   - repair AI nullable-array generated-validator compatibility;
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

From checkpoint `bfb3b3f`, Slices 1–9 are complete. Remaining work:

- Slice 10 transfers and renames orchestrator and SQLite;
- Slices 11–12 establish minimal root infrastructure and safe local automation;
- Slices 11–12 transfer minimal root infrastructure;
- Slices 13–17 repair, certify, package, and complete public-readiness handoff.

The plan remains 17 total transfer/certification slices; completed slices are not counted again as remaining work.

These are bounded review slices, not time estimates. A failed gate adds a repair slice rather than being waived.

## Ordering rationale

Coding-agent-first preserves the Creator's requested product focus and makes its identity rewrite concrete before supporting packages arrive. Dependency packages follow before root bootstrap so inherited workspace/release identity cannot activate accidentally. Root installation/build occurs only after every internal package has its final name and synchronized custom bootstrap version. Publication remains last.
