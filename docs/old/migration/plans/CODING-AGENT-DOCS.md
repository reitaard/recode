# Coding-Agent Documentation Rewrite Plan

Source: `../re.pi/packages/coding-agent` at `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`.

This plan prevents a blind rewrite of 12,605 inherited documentation lines. It assigns each current file an owner and final disposition before package source is copied. It does not make inherited documentation authoritative. Recode is intended for public collaboration, so consolidation must improve discoverability and maintenance without removing depth that external extension, SDK, protocol, session, platform, or subsystem contributors need. See the [public repository plan](PUBLIC-REPOSITORY.md).

## Rewrite principles

1. Derive command syntax from the CLI parser/help and command implementations, not old prose.
2. Derive public programmatic APIs from the package export map and exported declarations/source barrels.
3. Keep Aizen as the default runtime. Mark AgentSession SDK, extensions, JSON mode, and RPC mode as retained compatibility surfaces where they run through the legacy session runtime.
4. Keep `.pi` and `PI_*` names only where current source still implements them as compatibility configuration/schema names.
5. Route AI-provider details to `packages/ai/README.md` and renderer/component details to `packages/tui/README.md`; coding-agent docs explain only integration and user configuration.
6. Separate current behavior, security limits, compatibility, and approved TODOs. Do not preserve chronology or speculative migration sections.
7. Use local source links until a standalone repository URL is approved.
8. Do not promise installation, self-update, publication, binaries, native behavior, or platforms before their release gates pass.

## Proposed final package documentation set

The package should retain a navigable contributor-facing set rather than one file per inherited topic. The original 20-file target is a lower-bound consolidation sketch, not a hard cap; public readiness may justify approximately 22–26 focused text documents when subjects have independent compatibility, troubleshooting, or safety contracts.

| Final file | Owns |
|---|---|
| `README.md` | Package identity, status, installation boundary, minimal CLI start, runtime modes, public exports, links. |
| `docs/index.md` | Package-local navigation only. |
| `docs/cli.md` | Commands, options, modes, file arguments, tool selection, exit/output behavior. |
| `docs/configuration.md` | Settings, environment variables, project instructions, paths, offline/trust behavior. |
| `docs/sessions.md` | Session selection/storage/tree behavior, compaction overview, format links and compatibility limits. |
| `docs/session-format.md` | Versioned JSONL schema and `SessionManager` contract, generated from/current with source types. |
| `docs/customization.md` | Routing overview for extensions, skills, prompt templates, themes, and packages. |
| `docs/extensions.md` | Exported extension lifecycle/API; detailed compatibility reference. |
| `docs/packages.md` | Package discovery/install/config contract and security boundary. |
| `docs/sdk.md` | Exported SDK and AgentSession compatibility APIs. |
| `docs/rpc.md` | Versioned JSONL RPC protocol and extension UI protocol. |
| `docs/json.md` | Read-only/output event stream mode if still distinct from RPC after implementation review. |
| `docs/providers.md` | Coding-agent provider selection/auth integration; route catalog/API internals to AI. |
| `docs/security.md` | Trust, tools, extensions, credentials, remote/package risks, no-sandbox statement. |
| `docs/platforms.md` | Verified Windows, terminal, tmux, Termux, container, and local-model notes with explicit certification status. |
| `docs/memory.md` | Kioku/Shiori/Cardinal user contract and admission boundary. |
| `docs/workers.md` | Named worker IDs, bounded behavior, no retry/fallback, and distinction from Maestro. |
| `docs/maestro.md` | CLI routing and user-facing handoff only; detailed ownership remains orchestrator README/docs. |
| `docs/telegram.md` | Gateway setup, allowlist/authentication, persistence and operational limits. |
| `docs/development.md` | Package build/test/example checks and source layout after transfer. |

This table identifies the minimum owner set. `getting-started.md`, `skills.md`, `themes.md`, keybindings, or terminal setup may remain separate when source review shows that merging would harm contributor onboarding, API clarity, accessibility guidance, or troubleshooting. Images remain excluded unless recreated from the current product. Further merging is allowed only when it removes genuine duplication without hiding a public contract.

## One-by-one disposition

| Inherited path | Final disposition | Required evidence/action |
|---|---|---|
| `README.md` | rewrite in place | Manifest, CLI help, default Aizen selection, three exports, Node floor, release/install policy. |
| `docs/index.md` | rewrite in place | Route only to retained files; remove Pi site navigation. |
| `docs/quickstart.md` | merge into README + `cli.md` | Do not preserve unapproved installers or subscription claims. |
| `docs/usage.md` | merge into `cli.md` | Generate option/command tables from `args.ts` and command dispatch. |
| `docs/settings.md` | merge into `configuration.md` | Verify every key against `SettingsManager` and settings UI. |
| `docs/environment-variables.md` | merge into `configuration.md` | Inventory actual reads; classify `PI_*` as compatibility names. Avoid printing-secret examples. |
| `docs/keybindings.md` | merge into `configuration.md` or TUI README | Verify action registry/default bindings; coding-agent owns app actions, TUI owns key syntax/primitives. |
| `docs/shell-aliases.md` | merge into `platforms.md` | Keep only safe optional examples; no product contract. |
| `docs/terminal-setup.md` | merge into `platforms.md` | Verify capability detection and fallbacks. |
| `docs/windows.md` | merge into `platforms.md` | Verify shell selection and native helper fallback. |
| `docs/tmux.md` | merge into `platforms.md` | Operational guidance only; test claims separately. |
| `docs/termux.md` | merge into `platforms.md` | Block release claims until Termux artifact certification. |
| `docs/containerization.md` | merge into `platforms.md` | No sandbox implication; examples require explicit mounts/credential boundary. |
| `docs/llama-cpp.md` | merge into `platforms.md` or AI README | Local-model tests/downloads opt-in; provider ownership belongs to AI. |
| `docs/sessions.md` | rewrite in place | Reconcile Aizen session control with legacy `SessionManager`; distinguish CLI from SDK replacement APIs. |
| `docs/session-format.md` | rewrite in place | Verify every entry type/version/method against source and tests. |
| `docs/compaction.md` | merge into `sessions.md` | Keep current trigger/context/branch behavior; remove tuning chronology. |
| `docs/models.md` | merge into `providers.md` + AI README | Coding-agent owns selection/config UI; AI owns model schema/catalog. |
| `docs/providers.md` | rewrite in place | Auth/config selection only; link to AI package for implementation API. |
| `docs/custom-provider.md` | merge into `extensions.md` + AI README | Extension registration belongs here; streaming/provider implementation belongs to AI. |
| `docs/extensions.md` | rewrite in place, preserve detailed reference | Verify event names/order, sync/async rules, shutdown, UI availability, tool replacement, session replacement, mode behavior, and public imports. |
| `docs/packages.md` | rewrite in place | Verify source formats, scopes, settings mutation, package metadata compatibility key, updates, and trust. |
| `docs/skills.md` | merge into `customization.md` | Verify discovery precedence, validation, invocation, and model-invocation policy. |
| `docs/prompt-templates.md` | merge into `customization.md` | Verify discovery and expansion; avoid duplicated extension command docs. |
| `docs/themes.md` | merge into `customization.md` + TUI README | Coding-agent owns discovery/schema integration; TUI owns color/rendering semantics. |
| `docs/tui.md` | split between `customization.md`, `extensions.md`, and TUI README | Remove duplicated component API from coding-agent package guide. |
| `docs/sdk.md` | rewrite in place | Public root export only; label AgentSession runtime compatibility; verify examples 01–13. |
| `docs/rpc.md` | rewrite in place | Verify command/event union and framing from `rpc-types.ts`; note `./rpc-entry` consumer boundary. |
| `docs/json.md` | retain only if implementation-distinct | Verify event union and exit/error semantics; otherwise merge into `cli.md`. |
| `docs/security.md` | rewrite in place | Project trust, package/extension execution, credential boundaries, shell/tools, remote examples, no built-in sandbox. |
| `docs/memory.md` | rewrite in place | Remove migration status; verify Markdown authority, SQLite index, scopes, Teach Mode/Cardinal/Shiori. |
| `docs/telegram.md` | rewrite in place | Verify token/chat allowlist, long polling, command surface, storage/session ownership, shutdown/retry behavior. |
| `docs/development.md` | rewrite in place | Standalone commands only after source transfer; exclude rebranding/fork instructions. |
| `docs/docs.json` | exclude/recreate only if a docs-site build is adopted | It is not needed for package runtime or Markdown navigation. |
| four `docs/images/*.png` | exclude | Stale inherited UI/novelty images; recreate only referenced current screenshots. |

## High-risk references that require source-level certification

### CLI and runtime selection

- `recode` and `recode aizen` select Aizen; `--legacy` selects AgentSession compatibility.
- `--aizen` is rejected, not an alias.
- Top-level routed commands include Maestro, Doctor, package management/configuration, and Telegram; exact dispatch and help must agree.
- `--mode text|json|rpc`, `--print`, session selectors, trust flags, resource flags, and extension-defined flags have interaction rules that prose must not infer.

### Compatibility SDK and extensions

The package root is broad, but only root, `./workers`, and `./rpc-entry` are published. Documentation must never import private `src/` paths. Session switch/fork methods exposed to extension/SDK contexts do not restore removed Aizen CLI tools. Extension documentation must state which callbacks are unavailable without an interactive UI.

### Paths and environment

The manifest still sets `piConfig.configDir` to `.pi`; compatibility paths are therefore real. Product-facing prose remains Recode. Every environment variable must be traced to a source read before inclusion, especially inherited sharing, telemetry, auth, offline, package-dir, shell, and debug variables.

### Installation and update

Do not provide a normal installation command until standalone package publication is approved. The package version and Node requirement may be stated as source facts, but availability must not be implied. Self-update must be documented as fail-closed unless a validated Recode release endpoint exists.

### Protocol documents

RPC, JSON events, extension events, and session JSONL are compatibility contracts. Before rewrite, derive tables from exported discriminated unions and add focused drift tests or generation where practical. Hand-maintained 1,000-line protocol prose without a drift gate is not acceptable authority.

## Rewrite status

All four planned coding-agent documentation groups are drafted in the staged package:

1. identity, README, index, and CLI;
2. configuration, security, providers, sessions, and session format;
3. customization, packages, extensions, skills, themes, SDK, RPC, and JSON mode;
4. memory, workers, Maestro, Telegram, platforms, and development.

The result is 24 focused documents including the package README. They are replacement owner documents, not copied inherited prose. Post-transfer work remains: compile examples, verify source links/imports, generate or drift-test protocol/settings/session contracts, test package contents, and rerun platform/runtime certification.

## Acceptance gates

- Every retained file maps to an owning source/export/test set.
- No retained link targets an inherited Pi repository or unapproved release endpoint.
- No command, option, setting, environment variable, event, method, or keybinding appears without current implementation evidence.
- No private module is presented as public API.
- No platform or artifact is called supported without its recorded gate.
- `rg` finds no product-identity use of Pi/RePi; remaining `.pi`, `PI_*`, `piConfig`, schema/event identifiers, and extension callback variable names are explicitly compatibility terms.
- Package docs link outward instead of copying AI, TUI, AgentHarness, Maestro, worker, and memory ownership details.
- Examples compile against public exports and are linked only when retained by the exact transfer manifest.
