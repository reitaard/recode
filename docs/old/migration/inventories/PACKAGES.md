# Source Transfer Inventory

Source reference: `../re.pi` at `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`.

This inventory is completed package by package before source transfer. Exact cross-cutting classifications are maintained in [ROOT-INVENTORY.md](ROOT.md), [WORKFLOWS-INVENTORY.md](WORKFLOWS.md), [EXAMPLES-INVENTORY.md](EXAMPLES.md), and [ASSETS-INVENTORY.md](ASSETS.md). Documentation execution is ordered in [PACKAGE-DOC-PLAN.md](../plans/PACKAGE-DOCS.md) and [CODING-AGENT-DOC-PLAN.md](../plans/CODING-AGENT-DOCS.md). The one-row-per-tracked-path ledger is summarized in [COPY-MANIFEST.md](COPY.md).

## Root repository and automation

### Transfer

- root `package.json`, `package-lock.json`, `.npmrc`, `.gitignore`, `.gitattributes`, Biome and TypeScript configuration, license, security policy, focused contributor guidance, and the canonical `test.sh` credential-isolation gate after identity review;
- active build/check helpers: browser smoke entry/check, pinned-dependency and TypeScript-import checks, version synchronization, coding-agent shrinkwrap generation, release identity/manifest/artifact generation and verification, package discovery, local install/pack, binary/Termux builds, release/publish scripts, and their deterministic tests;
- CI, npm-audit, and binary-release workflows after branch, repository, action-pinning, permission, environment, package-set, and release-identity rewriting;
- `.github/RELEASE_NOTES.md` and other workflow inputs only when their current release role is verified during the exact inventory pass.

### Rewrite or repair before authority handoff

- Change root identity, authoritative branch, repository URL, custom baseline, product metadata, and release package lists for the standalone Recode repository. Current `release-identity.mjs` still requires branch `agent-harness`, root name `repi-monorepo`, product name `RePi`, and ancestry from a source-repository commit.
- Reconcile three conflicting package sets: root workspace/build includes SQLite and telemetry; `publish.mjs` includes telemetry but not SQLite; `release-identity.mjs` and `local-release.mjs` omit both. Define one deliberate build set and one deliberate publication set, then test both.
- Split deterministic AI tests from opt-in credential/local-model tests. Keep `PI_NO_LOCAL_LLM=1` and credential isolation in the default repository gate without moving a real auth file as the primary mechanism; use an isolated test configuration/directory instead.
- Pin third-party workflow actions consistently. Release automation uses commit pins, while CI and issue workflows still use mutable major tags.
- Retarget CI from source branch `main` only after the standalone branch policy is chosen. Preserve build/check/test ordering and add explicit platform gates where Linux-only CI is insufficient.
- Rewrite release-note repository defaults and inherited Pi/RePi compatibility names where they are product identity rather than actual environment/API compatibility.
- Keep release publication, tag creation, pushes, GitHub release mutation, package installation, and remote issue automation disabled until separately approved and tested in the new repository.

### Exclude

- source-repository `AGENTS.md`, `OPERATIONS.md`, `Current.md`, root README, contributing prose, and `tui-plan.md` as canonical files; their verified current content is rewritten into this repository's focused documentation.
- `Analyze/`, `update/`, `.pi/`, `.agents/`, `n8n-workspace/`, `re.pi-packages/`, nested `repi/` distribution state, machine-created `C:/`/`NUL` artifacts, dependencies, build output, binaries, logs, caches, sessions, and private/local configuration.
- personal analytics and debugging scripts (`cost.ts`, tool/session transcript statistics, edit/read statistics, and one-off WSL repro) unless the Creator explicitly adopts them as maintained developer tools.
- issue approval/gate/triage/analysis workflows and label automation until the standalone repository's governance, secrets, labels, runner trust, and external-contributor policy are deliberately approved. They are not required to build or test Recode.
- generated release assets, source archives, checksums, manifests, package tarballs, and copied binary directories; transfer generators and regenerate artifacts from an approved clean tag.

### Verification evidence

- Root manifest, tracked top-level inventory, script/workflow inventories, CI, binary release workflow, test gate, release identity, publisher, package consumers, and relevant Git history checked.
- Current tracked native `.node` files are the only generated/binary candidates found by the bounded tracked-file scan; they remain governed by TUI native certification.
- Current CI is Linux/Node 22 and runs install, build, mutating check, and workspace tests. Binary release uses Node 26.4, Bun 1.3.14, tag identity, trusted npm publication, checksummed artifacts, manual preview approval, draft staging, and cleanup.
- No workflow was run and no remote action was performed. Automation transfer means source review only until the rewritten standalone identity and permissions are approved.

## Global exclusions

Do not transfer:

- `.git`, remotes, worktrees, or source-repository hooks;
- `node_modules`, `dist`, coverage, caches, temporary build directories, or logs;
- `packages/coding-agent/binaries` and other generated/bundled copies;
- machine-local settings, credentials, sessions, memory indexes, or private evidence;
- `Analyze`, `update`, and migration/status diaries as canonical documentation;
- removed packages and surfaces listed in [migration coverage](../COVERAGE.md);
- obsolete package documentation classified below.

Lockfiles, generated source inputs, release manifests, workflows, scripts, fixtures, and checked-in assets are transferred only when they participate in the verified build, test, install, or release contracts.

## `packages/agent`

### Transfer

- `package.json`, TypeScript configs, package scripts, and `CHANGELOG.md`;
- `src/agent.ts`, `src/agent-loop.ts`, root entry points, iteration budget, proxy, stream defaults, and public types;
- active V3 `src/harness` runtime, sessions, tools, compaction, environment, telemetry, and journal code;
- isolated `src/harness/session-v4` library and public subpath exports;
- active tests and test configuration;
- telemetry documentation generator.

### Rewrite during transfer

- `README.md`: document low-level Agent, active AgentHarness, Node entry point, session/tool/telemetry exports, and isolated session-v4 subpaths.
- `docs/agent-harness.md`: retain verified current lifecycle, ordering, persistence, hook/event, cancellation, compaction, and error contracts only.
- `docs/telemetry-schema.md`: regenerate from typed schemas.
- Create one focused session-v4 document describing its current isolated-library API and integration boundary.
- Create a concise package `TODO.md` only for Creator-approved V4 runtime migration work.

### Exclude as canonical docs

- `docs/durable-harness.md` — design proposal superseded by the V4 design and not current runtime behavior;
- `docs/harness-v2.md` — implementation plan/specification, not the active coding-agent runtime;
- `docs/harness-v2-test-matrix.md` — migration QA ledger;
- `docs/hooks.md` — proposed hook architecture mixed with compatibility planning;
- `docs/observability.md` — earlier design superseded by typed telemetry schemas;
- implementation phases and TODO sections from `docs/models.md`; model/provider current contracts belong to the AI package audit.

### Verified boundary

Coding-agent, Aizen, workers, and Shiori use the active V3 `AgentHarness`. Session V4 is exported as `./session-v4` and `./session-v4/testing`, with reducer, memory, JSONL, context, and conformance tests active. V4 AgentHarness scaffold and branch-summary tests remain inactive pending a separately approved runtime migration.

### Verification evidence

- Active AgentHarness focused tests: 19 passed.
- Session V4, storage, and telemetry focused tests: 258 passed.
- Public export map and root barrels checked.
- Coding-agent imports checked against active AgentHarness.

## `packages/ai`

### Transfer

- package manifest, TypeScript/Vitest configuration, changelog, root compatibility shims, and public entry points;
- provider factories, API implementations and lazy wrappers;
- models runtime, model/image catalog sources, provider data, and generation scripts;
- credential store, provider-owned authentication, OAuth subpath, scoped environment handling, and session-resource cleanup;
- message/content types, tools, streaming, images, retries, overflow handling, validation, compatibility adapters, and test faux provider;
- unit tests and explicit E2E/smoke tests, preserving their distinction.

### Rewrite during transfer

- Keep `README.md` as the canonical AI package guide, but remove migration chronology and describe compatibility exports as compatibility rather than preferred architecture.
- Move only verified current model/provider contracts from `packages/agent/docs/models.md` into the AI README when they are not already covered.
- Keep provider addition instructions synchronized with generation scripts, data manifests, provider factories, exports, and tests.

### Exclude as canonical docs

- `packages/agent/docs/models.md` as a whole; its completed phase plan, future compatibility deletion, and coding-agent migration sections are not current AI reference documentation.
- Removed raw API subpaths and selective base entrypoints; current exports are root, `compat`, provider/API wildcards, `oauth`, and `bedrock-provider`.
- Generated catalog files are build inputs/outputs governed by scripts and manifests, not hand-edited documentation.

### Verified boundary

The root AI entry point exposes the current Models/provider/auth/types surface. Compatibility behavior is isolated under `./compat`; provider and API implementations have explicit subpaths. The legacy OAuth subpath remains supported with caller-owned credential storage, while provider-owned auth and credential stores are preferred. AgentHarness consumes the Models runtime through the AI package boundary.

### Verification evidence

- Manifest export map, root barrel, provider/API structure, generated data pipeline, README, and relevant Git migration history checked.
- Test inventory confirms 128 Vitest files with unit and credential/local-model E2E behavior mixed under one default configuration. Files named `e2e` or `smoke` are not the complete network-test boundary; many ordinary files contain credential-gated live suites.
- A bounded gate with `PI_NO_LOCAL_LLM=1` and ten explicit contract files completed without a model pull: 9 files passed, 1 failed; 137 tests passed and 196 credential-gated tests skipped.
- The one failure reproduces in isolation in `validation.test.ts`: TypeBox-generated code calls `.every` on `null` for a nullable array schema. The package's interpreted `validateToolArguments` behavior passes, but generated-validator compatibility is not certified.
- Transfer the tests, but split deterministic unit and explicit network/local-model gates during the documentation/test rewrite. Keep local-model tests disabled by default in certification and require opt-in for downloads.

## `packages/coding-agent`

### Transfer

- package manifest, checked-in npm shrinkwrap, TypeScript/Vitest configuration, changelog, asset-copy inputs, and active package scripts;
- CLI, main entry, default Aizen runtime, explicit `aizen` command, `--legacy` compatibility path, interactive/text/JSON/RPC modes, Bun entry, and RPC executable;
- active AgentSession/SDK compatibility runtime, session manager and JSONL format, compaction, model/auth configuration, resource loading, project trust, settings, package management, extensions, skills, prompts, themes, tools, exports, and utility code;
- Recode session identity/control/storage, gateway and Telegram adapter, Kioku memory, Cardinal routing, Teach Mode, Shiori, named-worker directory and worker implementations;
- Maestro CLI/status/completion handoff, LSP integration, Doctor, validated self-update policy, OpenAI OAuth/Open Provider adapters, TUI integration, HTML export assets, themes, and active tests/fixtures;
- the focused SDK and extension example subset approved in `EXAMPLES-INVENTORY.md`, after identity, export, security, dependency, and runtime review.

### Rewrite during transfer

- Rewrite and consolidate `README.md` plus the inherited package docs according to [CODING-AGENT-DOC-PLAN.md](../plans/CODING-AGENT-DOCS.md); the 12,605-line set contains 31 identity-affected text guides plus stale images/site metadata and should become a smaller owner-focused reference rather than a line-for-line rewrite.
- Make `recode`, standalone `@reitaard/recode-coding-agent`, Aizen-by-default, and current Recode update/release boundaries authoritative. Treat source `@reitaard/repi-coding-agent` as predecessor identity. Preserve `.pi` only where it is the verified compatibility/configuration path.
- Replace upstream repository links with local source links or the eventual Recode repository, and remove upstream session-promotion, installer, telemetry, package-gallery, philosophy, and contributor material unless current Recode source independently implements and approves it.
- Reconcile `quickstart`, `usage`, `settings`, `environment-variables`, `packages`, and platform guides with current CLI help, configuration, trusted npm install/update policy, and Node requirement.
- Reconcile `sdk`, `rpc`, `json`, `session-format`, `sessions`, `compaction`, `extensions`, `tui`, `models`, `providers`, and `custom-provider` against root exports, typed protocols, examples, and owning package docs. AI and TUI details belong primarily to those packages.
- Retain `memory.md` and `telegram.md` only after rewriting them as current focused contracts; remove versioned migration status and speculative future architecture.
- Apply `EXAMPLES-INVENTORY.md`: retain a smaller maintained SDK/extension teaching set, correct Pi identity and stale filenames, and gate external/platform examples separately. The inherited process-spawning `subagent` example is excluded because it is not Recode's named-worker or Maestro contract.

### Exclude or regenerate

- Exclude `dist/`, `binaries/`, local `node_modules/`, coverage/caches/logs, and other generated or bundled copies.
- Exclude `install-lock/` unless the release audit proves it is a current deterministic release input; the package's checked-in `npm-shrinkwrap.json` is the declared publication artifact.
- Exclude `src/server/create-harness.ts` and `test/server/create-harness.test.ts` from the approved current boundary unless repaired and explicitly adopted before transfer: they were added by the unintegrated upstream package port, are not exported or consumed, call absent `AgentHarness.create`, and currently fail all five focused tests.
- Regenerate copied themes and HTML assets in `dist/` from `src/`; never transfer their generated copies.
- Exclude migration/status prose, upstream promotional sections, and examples that are obsolete, duplicate active Recode facilities, fail compilation/tests, or violate current policy after focused review.

### Verified public and runtime boundary

The package publishes only the root API, `./workers`, and `./rpc-entry`. The root is a broad compatibility/SDK/extension surface and is consumed by Maestro; `rpc-entry` is resolved by the orchestrator subprocess. Recode starts Aizen by default, while `--legacy` explicitly selects the retained AgentSession path. Named workers use stable ids `research`, `audit`, and `shiori`; worker failure does not trigger automatic retry or silent parent fallback. Kioku keeps Markdown authoritative with a SQLite index. Doctor is bounded and read-only. Core self-update fails closed without a validated Recode release endpoint; independent package updates remain available.

### Verification evidence

- Package manifest, three export paths, root/core barrels, CLI parser/help, Aizen runtime, SDK compatibility runtime, workers, memory, gateway, Telegram, LSP, Doctor, self-update, examples/import consumers, and relevant Git decisions checked.
- Focused core integration gate: 5 files, 51 tests passed.
- Additional Aizen/worker/memory/Shiori/Teach/gateway/LSP/Maestro gate: 13 files, 53 tests passed.
- Broad selected gate: 12 files and 152 tests passed; its only failure was the isolated unexported `server/create-harness` port (5 failing tests), classified above rather than represented as active functionality.
- Full package suite, example compilation, platform behavior, binary build, and rewritten documentation remain post-transfer certification gates.

## `packages/tui`

### Transfer

- package manifest, TypeScript configuration, changelog, source, tests, test fixtures/demos, and the package's single root export surface;
- component primitives, editor/input/autocomplete/keybindings, Markdown/LaTeX, ANSI-aware width and wrapping, image protocols, terminal color queries, input buffering, overlays, layouts, scroll views, regular and fullscreen renderers;
- `ProcessTerminal`, keyboard-protocol negotiation, terminal setup bindings, bounded diagnostics, native-modifier loader, and platform native-addon source/build scripts;
- checked-in Darwin and Windows native prebuilds only as release artifacts requiring independent provenance or reproducible rebuild certification before publication.

### Rewrite during transfer

- Rewrite `README.md` against `src/index.ts` and current renderer architecture. Its quick start constructs `new TUI(...)`, but `TUI` is now an interface and the implementation is split into `TuiMainScreen` and `TuiAltScreen`.
- Document regular versus fullscreen/viewport rendering, layout roots, scroll views, stacked layouts, wheel behavior, renderer-state handoff, diagnostics, terminal color queries, keyboard negotiation, and native fallbacks.
- Correct the `Terminal` contract and examples to include current protocol, input-drain, title, progress, and lifecycle requirements.
- Keep extension-facing component and overlay guidance, but reconcile every example with current types and tests rather than preserving the inherited monolithic API narrative.
- Rewrite native build guides or add the missing package/root scripts; both currently instruct users to run nonexistent `build:native:win32` and `build:native:darwin` npm scripts.
- Explain legacy `PI_*` environment names only as verified compatibility names; do not use them as product identity.

### Exclude or regenerate

- Exclude `dist/`, local dependencies, logs, caches, and generated declarations/maps/JavaScript.
- Do not treat `vitest.config.ts` as the package test authority: `npm test` uses Node's test runner across `test/*.test.ts`; the Vitest config is a narrow compatibility file for `wrap-ansi.test.ts`.
- Do not publish native `.node` files merely because they are checked in. Preserve them during certification, verify hashes/provenance or rebuild them for all four declared targets, then explicitly approve or replace them.
- Keep executable demos (`chat-simple.ts`, image/key testers, viewport reproduction) as examples/diagnostic programs, not automatic unit tests unless their filenames match the Node test command.

### Verified public and runtime boundary

The package publishes one root API. Coding-agent is its principal consumer and constructs `TuiMainScreen` for regular mode or `TuiAltScreen` for fullscreen mode. The root exports high-level components and renderers plus terminal, input, image, keybinding, diagnostics, and ANSI utilities; several layout internals remain package-private. Native helpers are optional and fail soft: Windows enables virtual-terminal input and modifier detection, while Darwin provides modifier detection. The JavaScript path remains functional when a helper is absent.

### Verification evidence

- Manifest, root barrel, renderer/terminal/diagnostics/native boundaries, coding-agent and orchestrator consumers, README, native guides, and relevant history checked.
- Complete declared package gate: 52 suites, 878 tests passed with Node's test runner.
- No TUI source changes were produced by the test run.
- Native binaries were not executed or rebuilt for all target platforms; cross-platform native certification remains pending.

## `packages/telemetry`

### Transfer

- package manifest, TypeScript configuration, changelog, root and `./testing` exports;
- callback-based context/span contract, no-op context, deterministic in-memory implementation, typed serializable schema helpers, and runner-independent adapter conformance cases;
- focused tests.

### Rewrite during transfer

- Shorten `README.md` to the currently implemented generic contract, exact exports, adapter obligations, testing subpath, and security limits.
- Replace inherited Pi product identity with Recode package ownership while retaining `pi.ai.*`, `pi.harness.*`, and `pi.session.*` only where those are the actual compatibility schema names emitted by the agent package.
- State the current integration precisely: AI request options accept and propagate a telemetry context; agent owns schema values and helper functions. Do not claim that current Aizen/AgentHarness execution actively emits the full schema unless call-site verification is added.
- Keep examples focused on the working no-op, in-memory, typed starter, and conformance APIs; remove explanatory duplication that does not define behavior.

### Exclude or regenerate

- Exclude `dist/`, local dependencies, caches, and generated declarations/maps/JavaScript.
- Exclude the superseded telemetry architecture in `packages/agent/docs/observability.md` and telemetry plans embedded in `harness-v2.md`; current package source, tests, and generated agent schema own the working contract.
- Do not introduce exporter, ambient global-span, runtime validation, persistence, or backend-specific behavior: none exists in this package.

### Verified public and runtime boundary

The package has two public paths: the root generic API and `./testing`. It is vendor-neutral and explicitly propagated. The root provides passive callback-managed spans, schema typing, a shared no-op, and an unbounded process-local reference recorder. The testing subpath uses Node assertions to provide adapter conformance cases. Agent and AI depend on the package; agent re-exports much of the generic surface and owns domain schemas. Current source verification found telemetry context propagation and schema/helper definitions, but not active production calls that emit those agent schemas, so documentation must not represent full product tracing as active.

### Verification evidence

- Manifest, exports, all source files, agent/AI consumers, schema generator, README, tests, and introduction history checked.
- Complete declared package gate: 2 files, 15 tests passed.
- No telemetry source changes were produced by the test run.

## `packages/orchestrator`

### Transfer

- package manifest, TypeScript configuration, changelog, root library and `./cli` entry points;
- Recode Maestro CLI, service runtime, IPC/authentication, RPC child process, supervisor, state projection, storage, process/service ownership, native service management, dashboard, workspace admission, turn leases, lifecycle contract/adapters, child-environment filtering, diagnostics, and active tests;
- completion queue only with its currently passing enqueue, delivery, lifecycle, and deduplication behavior; do not certify restart recovery until its failing focused test is repaired.

### Rewrite during transfer

- Keep `README.md` concise and limited to working Maestro behavior: Windows/Linux current-user service management, full-session supervision, TUI attach/detach, explicit cancel/stop, authenticated local IPC, environment filtering, read-only/write workspace admission, and non-sandbox security limits.
- Add the CLI commands that current source implements but the README omits only when they are intended public operations: attach, search, diagnose, status, cancel, stop, RPC, and RPC stream.
- Avoid claiming crash-safe completion recovery. The dedicated recovery test currently fails reproducibly because restart recovery creates zero queue records where one is required.
- Keep named workers separate from Maestro's full-session process supervision. Do not restore absent Phase 4 target routing, old attach UI/RPC bridge, automatic worktree management, or sandbox claims.
- Describe Linux systemd-user and Windows Task Scheduler/Job Object behavior as platform-specific implementation; macOS native service management is unsupported.

### Exclude or regenerate

- Exclude `dist/`, local dependencies, caches, logs, generated declarations/maps/JavaScript, and embedded release manifests regenerated by release tooling.
- Exclude absent `target-routing.ts`, `request-handler.ts`, replaced `attach-ui.ts`/`rpc-bridge.ts`, and archived Maestro roadmap/checkpoint behavior that current source does not implement.
- Do not document completion restart recovery as working until `completion-queue.test.ts` passes; either repair that path before transfer certification or exclude the broken recovery promise while retaining independently passing queue behavior.
- Add a package `test` script or make the repository gate explicitly own these tests; the package currently declares no test script despite 15 test files.

### Verified public and runtime boundary

The package exports a broad root library and executable CLI subpath. Coding-agent routes `recode maestro` to the package CLI, queries health for Doctor/footer status, and uses completion handoff through Aizen RPC. Maestro supervises at most ten live full-session processes by default. Read-only sessions launch with tools disabled and reject mutating RPC; concurrent writers cannot share one worktree, and write-capable child sessions require an explicitly selected sibling worktree in the same Git common directory. Maestro never creates or mutates worktrees and is not a sandbox. Native service management supports Linux and Windows only.

### Verification evidence

- Manifest, exports, CLI, runtime/service/native ownership, IPC, supervisor, dashboard, storage, workspace safety, environment filtering, coding-agent/release consumers, README, tests, and relevant history checked.
- Direct full test invocation: 19 suites, 72 tests; 71 passed and 1 failed.
- The single failure reproduces in isolation: `completion-queue.test.ts` restart recovery expects one durable record and observes zero. No pass or crash-recovery certification is claimed.
- Previously verified focused Maestro gate remains 24/24 passed, but it did not cover this defect.

## `packages/storage/sqlite-node`

### Transfer

- package manifest, TypeScript configuration, changelog, build helper, root entry point, SQLite abstractions, migration loader and SQL assets, session repository, storage/materialization modules, and the owning AgentHarness SQLite tests;
- `createNodeSqliteFactory`, `SqliteSessionRepo`, `SqliteSessionStorage`, migration functions, storage helpers, and public SQLite/session types exposed by the single root entry point.

### Rewrite during transfer

- Expand `README.md` from its current three-line summary into a concise optional-backend guide: Node requirement, `node:sqlite` dependency, factory/repository setup, database ownership and cleanup, WAL/FULL synchronous/busy-timeout configuration, migrations, session create/open/list/delete/fork behavior, and limitations.
- Use standalone dependency identity `@reitaard/recode-agent-core`; the source checkpoint uses predecessor `@reitaard/repi-agent-core`, while its inherited README incorrectly says `@reitaard/repi-agent`.
- State that this is an optional build participant and root workspace, not the default coding-agent session backend and not currently in `scripts/publish.mjs` or local-release package lists.
- Keep tests with the AgentHarness contract owner or add a package-local script that invokes those exact tests; the storage package currently declares build only and has no local test directory/script.

### Exclude or regenerate

- Exclude checked-in `dist/`, declarations, maps, JavaScript output, local dependencies, caches, databases, WAL/SHM files, and logs.
- Regenerate `dist/` with the package build. Preserve `scripts/prepare-dist.mjs` and source migration SQL because the build copies migrations beside emitted JavaScript for runtime URL loading.
- Do not claim remote/multi-process coordination, encryption, backup, schema downgrade, migration rollback, or publication availability; those contracts are not implemented or wired.

### Verified public and runtime boundary

The package has one root export and uses Node's synchronous `DatabaseSync` behind an async capability interface. It configures WAL, `synchronous=FULL`, and a 5-second busy timeout, then applies one idempotent initial migration. `SqliteSessionRepo` supports create, open, list with optional exact-CWD filtering, delete, and fork through AgentHarness session contracts. Session storage owns branch projection, entry/materialized views, sequence allocation, and cleanup. The root repository builds this package, but current consumers are the AgentHarness SQLite contract tests; coding-agent remains on its separately verified JSONL/Kioku storage paths.

### Verification evidence

- Manifest, root exports, all source/storage modules, initial migration, build-copy helper, root workspace/build/release wiring, consumers, README, and introduction/restore history checked.
- Focused Vitest gate in the Agent package: 2 files and 12 tests passed.
- Package build passed and emitted both `dist/index.js` and `dist/sqlite/migrations/001_initial.sql`.
- Direct `node --test` is invalid for these Vitest tests and failed during framework initialization; it is not a product failure.
- No package-local test script exists, and npm publication is not currently wired. Those are explicit transfer/release decisions rather than inferred support.

## Remaining repository slices

The release-path package inventory is now classified. Remaining certification work is cross-cutting:

- archive coverage/disposition;
- coding-agent, TUI, telemetry, orchestrator, AI, and SQLite documentation rewrites;
- final review/freeze of the exact transfer ledger's rewrite and quarantine groups;
- post-transfer build, test, release, identity, link, and platform gates.
