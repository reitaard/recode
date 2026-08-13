# Core Package Documentation Rewrite Plan

Source: `../re.pi` at `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`.

This plan covers Agent, AI, TUI, telemetry, orchestrator, and SQLite storage documentation. Coding-agent has its own [file-level plan](CODING-AGENT-DOCS.md). No inherited package README is standalone Recode authority before rewrite and post-transfer checks.

## Shared rules

- Package README files own only exported/public behavior and minimal supported setup.
- Installation snippets must not imply that a package is currently available from a standalone Recode release. During migration, use source-workspace examples or clearly mark package names as intended publication identities.
- Derive imports from `package.json#exports`; never document private source paths.
- Keep architecture proposals, completed phases, audit chronology, and migration ledgers out of package docs.
- Keep generated output and copied docs out of source edits.
- State Node `>=22.19.0` consistently unless a stricter package/platform requirement is proven.
- Put platform/native/network caveats beside the exact feature they constrain.
- Test commands must match package scripts and actual runner configuration.

## Agent core

### Final documentation

| Path | Disposition |
|---|---|
| `README.md` | Rewrite as the public map for low-level `Agent`, active `AgentHarness`, `./node`, and isolated `./session-v4` surfaces. |
| `docs/agent-harness.md` | Rewrite to current V3 lifecycle, ordering, persistence, cancellation, hook/event, compaction, and error contracts. Remove goals, implementation TODOs, and coding-agent migration plans. |
| `docs/session-v4.md` | Create from exported isolated library types and conformance tests. State explicitly that coding-agent does not use it as its active harness runtime. |
| `docs/telemetry-schema.md` | Regenerate from typed schemas; retain `pi.*` span names only as actual compatibility schema identifiers. Add generated-file header and command. |
| `docs/durable-harness.md` | Exclude; superseded proposal. |
| `docs/harness-v2.md` | Exclude; historical design/implementation ledger. |
| `docs/harness-v2-test-matrix.md` | Exclude; migration QA ledger. |
| `docs/hooks.md` | Exclude as standalone proposal; move only verified current hook contracts into `agent-harness.md`. |
| `docs/models.md` | Exclude; AI package owns provider/model architecture. |
| `docs/observability.md` | Exclude; superseded design and unverified emission claims. |

### README structure

1. package purpose and runtime layers;
2. export map;
3. minimal low-level `Agent` example;
4. minimal active `AgentHarness` example;
5. message/tool/event and queue semantics;
6. Node-only boundary and storage adapters;
7. Session V4 isolation boundary;
8. focused docs/tests.

Do not merge the 3,412-line Harness V2 design into current docs. Current contracts must be reconstructed from exports, V3 source, and passing tests.

## AI

### Final documentation

Retain one package `README.md`, but reduce the inherited 1,567-line mixed tutorial/reference to an owner-focused guide. If the API table remains too large, split only into `docs/providers.md` and `docs/auth.md`; do not recreate coding-agent configuration docs here.

Required sections:

1. public exports: root, `compat`, provider/API wildcards, `oauth`, and `bedrock-provider`;
2. `Models`, provider factories, static/dynamic catalogs, and provider-scoped auth;
3. streaming/completion, messages, tools, images, reasoning, errors, abort, and cleanup;
4. custom provider/API extension boundaries;
5. browser/tree-shaking limitations;
6. deterministic build versus network-backed catalog refresh;
7. deterministic tests versus credential/local-model opt-in tests;
8. provider-addition checklist synchronized with generator, manifest, exports, and tests.

Required corrections:

- Present root APIs as preferred and `./compat` as compatibility.
- Remove migration chronology and completed-phase language.
- Do not promise every listed model/provider without generated catalog validation.
- Document the current nullable-array generated-validator defect as an unresolved test boundary, not normal supported behavior.
- Never make local model pulls part of default certification.
- Treat generated catalogs as reviewed source inputs; do not tell routine builders to refresh them implicitly.

## TUI

### Final documentation

| Path | Disposition |
|---|---|
| `README.md` | Full rewrite against the root export and current renderer split. |
| `native/darwin/README.md` | Rewrite with an actual verified build command/toolchain, or keep internal/quarantined until certification. |
| `native/win32/README.md` | Same. |

README structure:

1. `TuiMainScreen` regular renderer versus `TuiAltScreen` fullscreen renderer;
2. terminal contract and `ProcessTerminal`;
3. component/focus/input/layout primitives;
4. overlays, scroll views, renderer handoff, width/ANSI rules;
5. image and keyboard protocol behavior;
6. diagnostics and fallback behavior;
7. optional native helpers and uncertified-prebuild warning;
8. exact Node test/build commands.

Never show `new TUI(...)`; `TUI` is an interface. Do not claim that checked-in `.node` files are publishable until provenance/rebuild and target smoke tests pass. Distinguish executable demos from declared tests.

## Telemetry

Rewrite the 464-line README to a concise generic adapter contract:

1. `TelemetryContext`, spans, attributes/events, and explicit propagation;
2. no-op context;
3. in-memory recorder and its process-local/unbounded nature;
4. schema helpers and type inference;
5. `./testing` conformance contract;
6. serialization/redaction/cardinality responsibilities;
7. integration status.

Do not claim ambient context, exporters, runtime validation, persistence, or active product-wide emission. Agent owns domain schema names. Preserve `pi.ai.*`, `pi.harness.*`, and `pi.session.*` only as emitted compatibility identifiers.

## Orchestrator

Rewrite the short README because brevity currently hides consequential boundaries.

Required sections:

1. Maestro purpose and distinction from named workers;
2. exported library and `./cli`;
3. CLI command map verified from source;
4. service/process ownership on Linux and Windows;
5. authenticated local IPC and child environment filtering;
6. full-session supervision and attach/detach;
7. workspace admission, sibling-worktree rule, and no automatic worktree mutation;
8. completion handoff with explicit restart-recovery limitation;
9. cancellation/stop and diagnostic behavior;
10. package test gap.

Do not claim sandboxing, macOS service support, Phase 4 routing, automatic worktrees, or crash-safe completion recovery. Add a package test script or document the root-owned invocation before authority handoff.

## SQLite storage

Rewrite the five-line README into a focused optional-backend guide:

1. intended package identity and Node `node:sqlite` requirement;
2. root exports and setup example using `createNodeSqliteFactory`, repository, and storage;
3. database ownership/cleanup;
4. WAL, `synchronous=FULL`, and busy-timeout behavior;
5. migrations and emitted SQL asset requirement;
6. create/open/list/delete/fork behavior;
7. exact-CWD filtering and limitations;
8. testing and publication status.

Do not present this backend as coding-agent's default or currently published. Do not promise encryption, backups, remote coordination, rollback/downgrade, or broad multi-process guarantees.

## Execution status

Drafted before source transfer:

1. Agent README, active AgentHarness doc, and isolated Session V4 doc;
2. TUI README and corrected direct native build guides;
3. telemetry README;
4. SQLite README;
5. orchestrator README with the recovery defect and missing test-script boundary explicit.

Drafted before source transfer now also includes:

1. AI README covering preferred root APIs, provider/auth/catalog ownership, stream/tool/image/custom-provider contracts, compatibility boundaries, deterministic generation/testing, and the known nullable-array generated-validator defect;
2. all four coding-agent documentation groups (24 focused owner documents).

Still to generate:

1. Agent telemetry schema from transferred typed source, following the [regeneration plan](AGENT-TELEMETRY-SCHEMA.md);
2. protocol/settings/session drift artifacts and example/import certification after source transfer.

Drafted files remain provisional until their imports/examples compile against transferred source and the per-package gates below pass.

## Per-package acceptance gates

For each package:

- compare documented imports to its export map;
- run its declared focused tests and build without mutating generated network data;
- inspect `npm pack --dry-run` only after package files/identity are rewritten;
- scan links and stale product identity;
- scan every code symbol/config name shown in prose against source;
- confirm dependent-package terminology and links;
- explicitly list unrun network, native, browser, binary, and platform checks.

## Cross-package completion gates

- Coding-agent docs link to Agent, AI, TUI, telemetry, SQLite, and orchestrator owners rather than duplicating their internals.
- Session V4 is never confused with active V3 AgentHarness.
- Generic telemetry API is never confused with verified active instrumentation.
- SQLite availability is never confused with default storage or publication.
- Named workers are never confused with Maestro full-session processes.
- Package build docs distinguish deterministic compilation from network refresh.
