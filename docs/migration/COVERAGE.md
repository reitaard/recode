# Doc Coverage

Track every archived source before deletion. Status: `pending`, `checked`, `moved`, `old`, or `unknown`.

| Old area | Topic | Code/tests checked | New home | Status |
|---|---|---|---|---|
| `old/root/AGENTS.md` | coding and repository rules | current scripts/config checked; inherited governance/release rules explicitly excluded | `AGENTS.md`, `coding/`, [archive inventory](inventories/ARCHIVE.md) | checked |
| `old/root/CONTRIBUTING.md`, `SECURITY.md` | public contribution and vulnerability policy | inherited gatekeeping/contact assumptions rejected; Recode pre-launch contribution/support drafts and governance/security decision plans created | root `CONTRIBUTING.md`, `SUPPORT.md`, [public readiness](plans/PUBLIC-REPOSITORY.md) | moved |
| `old/root/OPERATIONS.md` | build, install, release, runtime | scripts/source and safety boundaries checked; execution remains gated until transfer certification | `setup/`, `project/`, migration inventories | checked |
| `old/root/README.md` | product identity and usage | manifests, CLI args | `README.md`, `project/ABOUT.md`, `use/FEATURES.md` | moved |
| `old/root/Current.md` | runtime migration status | Aizen runtime source/tests checked | `project/CURRENT.md`, `project/DESIGN.md` | moved |
| `old/docs/AGENT*` | runtime, workers, telemetry, AI, and storage proposals | active V3 harness, V4 isolated library, coding-agent integration, telemetry/AI/SQLite packages, exports, history, builds, and focused tests checked | [project design](../project/DESIGN.md), [package inventory](inventories/PACKAGES.md), [package doc plan](plans/PACKAGE-DOCS.md), and [workers](../workers/INDEX.md) | checked |
| `old/docs/ARCHITECTURE_SOURCES.md` | external design comparisons | classified as non-authoritative point-in-time research | [archive inventory](inventories/ARCHIVE.md) | old |
| `old/docs/JARVIS_BUILD_PLAN.md` | obsolete personal-assistant phase plan | current harness, Aizen, workers, memory, gateway/Telegram, Maestro, SQLite, package identity, and deferred surfaces checked | current package/worker/Maestro docs, approved TODOs, and non-authoritative `project/FUTURE.md` | moved |
| `old/Analyze/*` | audits, plans, checkpoints | current runtime/worker/memory/Maestro/release claims independently classified; rankings, phase order, SLOs, and chronology remain historical | topic docs, [future possibilities](../project/FUTURE.md), and [archive inventory](inventories/ARCHIVE.md) | checked |
| `old/update/*` | updater facts and history | coding-agent updater/source identity and self-update tests checked; durable decisions routed; chronology/version state classified historical | [update policy](../setup/UPDATE.md) and [archive inventory](inventories/ARCHIVE.md) | checked |
| `old/packages/orchestrator/*` | Maestro use/history | CLI, source, full direct test set, and history checked; completion restart recovery remains explicitly uncertified | [Maestro](../maestro/INDEX.md), [package inventory](inventories/PACKAGES.md), and [archive inventory](inventories/ARCHIVE.md) | checked |
| `old/scripts/README.termux.md` | Termux | build/archive/install scripts and release workflow checked; no Android device run | platform rewrite after certification; [archive inventory](inventories/ARCHIVE.md) | pending |
| raw evidence files | benchmarks and checkpoints | benchmark/profile script ownership classified; historical outputs are machine/version-specific and non-authoritative | [evidence policy](../project/EVIDENCE.md) and [archive inventory](inventories/ARCHIVE.md) | old |

## Verified exclusions

These were explicitly removed or replaced in Git history and must not return to canonical docs:

| Removed surface | Disposition | Evidence |
|---|---|---|
| `packages/web-ui` | dropped workspace | `b141e1fa` |
| `packages/mom`, `packages/pods` | dropped packages | `0ed0d434` |
| Maestro `attach-ui.ts`, `rpc-bridge.ts` | replaced by raw RPC process | `a7b0138e` |
| `AgentSessionRuntimeHost`, `session_directory`, `session_switch`, `session_fork` | replaced by closure-based runtime and `session_start` reasons | `9f9277cc` |
| old named-worker registry | replaced by worker modules/directory | `c6b4dd13` |
| default worker timeout | removed; workers have no built-in timeout unless configured | `3a13f100` |
| automatic worker retry or silent parent fallback after failure | prohibited | `0216d7e3` |
| separate worker-chat sessions | replaced by worker chat entries in the Aizen session | `053dee25` |
| Doctor-owned build cycle | removed; Doctor uses existing runtime boundaries and remains read-only | `dea118d8` |
| unintegrated coding-agent `server/create-harness` upstream adapter | unexported and unused; calls absent `AgentHarness.create` and fails its five focused tests, so exclude unless repaired and explicitly adopted | `337e3859` plus current source/tests |
| telemetry architecture proposals beyond current generic package and schema definitions | exclude exporter/ambient-context/full-product tracing claims unless current production call sites verify them | `337e3859` plus current telemetry/agent/AI source and tests |
| Maestro crash-safe completion restart recovery claim | not currently certified: isolated recovery test expects one durable queue record and observes zero; repair before canonical documentation may claim it | current `completion-queue.test.ts` and runtime source |
| AI default suite as a deterministic unit gate | reject: the default configuration mixes credential/live and local-model suites, including an automatic Ollama pull path; certification must set `PI_NO_LOCAL_LLM=1` and split opt-in network gates | current AI Vitest config and test inventory |
| AI generated-validator nullable-array compatibility | not currently certified: focused test reproducibly calls `.every` on `null`; interpreted validation passes but generated TypeBox code does not | current `validation.test.ts` focused run |
| SQLite package as the default coding-agent backend or inherited published package | reject the default-backend claim and inherited omission: coding-agent uses other storage and the old publisher omits SQLite. Standalone policy approves SQLite in the seven-package `0.1.0` train, but publication wiring, registry availability, package certification, and actual publication remain pending | current root/package manifests, scripts, consumers, 12 focused tests, and approved versioning plan |
| JARVIS `packages/assistant`, scheduler, lazy sources, voice, mobile nodes, kernels, DAP, multi-channel routing, and durable delegation plan | exclude from current product docs; these are unimplemented phase proposals, not approved Recode commitments | archived build plan compared with current packages/exports/tests |
| source release identity (`agent-harness`, `repi-monorepo`, `RePi`, source baseline commit) | rewrite for standalone Recode before any release gate can be authoritative | root manifest, product metadata, `release-identity.mjs`, and tests |
| source issue governance/analysis workflows | exclude until repository governance, secrets, labels, runner trust, and external-contributor policy are approved | current `.github/workflows` inventory |
| inherited subprocess `examples/extensions/subagent` | exclude: it creates its own arbitrary agent/process/parallel-chain system and conflicts with stable named workers and Maestro ownership | current example source/docs, coding-agent worker contracts, and example typecheck |
| novelty/generated/redundant coding-agent examples | exclude by default; retain only a focused maintained teaching set, and move stress behavior into tests where appropriate | current 134-file source-commit inventory and [examples inventory](inventories/EXAMPLES.md) |
| external/remote/platform extension examples as supported features | do not claim without explicit provider, VM/sandbox, SSH, notification, and platform certification | current example source/manifests and bounded typecheck |
| package `dist`, copied assets, release manifests, archives, and generated binary output | exclude and regenerate from approved source inputs; never treat current working output as transfer source | package build/copy scripts and [assets inventory](inventories/ASSETS.md) |
| AI generated catalogs as disposable output or safe incidental refresh | reject: checked-in generated TypeScript and provider JSON are deliberate release inputs; refresh only through recorded network-backed generators and review | AI manifests, generators, build/build:release scripts, and catalog tests |
| inherited coding-agent screenshot set as current Recode documentation | exclude by default; recreate only images referenced by rewritten current docs | tracked image inventory and current documentation rewrite plan |
| standalone `migrate-sessions.sh` as current cross-platform operator contract | exclude unless explicitly adopted; startup owns migration and the shell helper is old Unix/jq-specific duplicated repair logic | package script and current startup migrations |
| inherited CI as deterministic/read-only certification | reject without rewrite: it runs network-backed AI generation, write-mode Biome checks, floating action tags/Node, and generic tests rather than the isolated credential-free gate | `.github/workflows/ci.yml`, root scripts, and [workflow inventory](inventories/WORKFLOWS.md) |
| inherited binary workflow as safe build-only automation | reject: tags can publish npm; tag or manual runs can mutate/publish GitHub Releases after environment approval; artifacts broadly include docs/examples and uncertified native inputs | `.github/workflows/build-binaries.yml` and [workflow inventory](inventories/WORKFLOWS.md) |
| inherited issue/contributor workflows as portable governance | exclude; they depend on source organization secrets, labels, contributor lists, permissions, gist sharing, and remote mutation | tracked workflow inspection and [workflow inventory](inventories/WORKFLOWS.md) |
| personal statistics and one-off reproduction scripts | exclude unless explicitly adopted as maintained developer tools; not required by build/check/release | current root script inventory and imports |
| old live VPS installation tree | retired after verified rollforward; artifact/inventory retained | `57a5fadd` |
| destructive local dependency reset via `npm ci` | replaced by `npm install --ignore-scripts` | `6864fa5d` |
| foreign-package self-update | rejected; updates fail closed unless package identity is Recode | `07dfcf67` |
| Maestro Phase 4 target routing (`target-routing.ts`, `request-handler.ts`) | absent from both parents of the current upstream port and not restored; excluded from current contracts | `9934e6c2`–`8ef5f64f`, `1c396093` |
| protocol/client/server and `session-backends/sqlite-node` as Recode runtime packages | ported source only; not root workspaces, build steps, or publication targets | `337e3859` |

Current retained contracts confirmed by history:

- Aizen is the default runtime; `--legacy` remains the explicit rollback switch (`5d6ac2d5`).
- Disabled extension discovery suppresses package-runtime discovery while explicit CLI extensions remain available (`e0d9e389`).
- Trusted npm publishing with provenance is implemented and hardened (`25db4769`, `5301646f`, `5b250e0e`).
- Core self-update remains disabled unless the host supplies a validated Recode release endpoint; package updates remain independent.

A deletion caused only by file movement, API consolidation, or test relocation is not classified as a dropped capability without commit and replacement-path evidence.

A file may be purged only when all useful claims are `moved`, `old`, or deliberately rejected, with Creator approval.
