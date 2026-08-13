# Recode Coding Agent

The coding-agent package integrates Recode's CLI, interactive terminal application, Aizen runtime, legacy AgentSession compatibility runtime, resource system, SDK, headless protocols, workers, memory, Maestro routing, and Telegram gateway.

The standalone repository is still being assembled. Normal installation and publication instructions are intentionally withheld until package identity, version lineage, artifacts, and registry publication are certified.

## Runtime modes

- `recode` and `recode aizen` start Aizen, backed by `AgentHarness`.
- `recode --legacy` selects the retained AgentSession compatibility runtime.
- `--print` runs one non-interactive request.
- `--mode json` emits session events as JSONL.
- `--mode rpc` accepts commands and emits responses/events as JSONL.
- `recode maestro`, `doctor`, package commands, and `telegram` route to dedicated command handlers.

Aizen is the product default. The SDK, extension host, JSON mode, and RPC mode retain AgentSession compatibility contracts; do not infer that every legacy API is an Aizen CLI feature.

## Public entry points

The intended export map, pending transferred-manifest and packed-content verification, contains:

- package root: SDK, sessions, tools, resources, extensions, settings, models, gateway, and compatibility types;
- `./workers`: named-worker APIs;
- `./rpc-entry`: executable side-effect bootstrap for a child RPC process; it is not a library API.

Never import package-private `src/` paths.

## Start here

- [Documentation index](docs/index.md)
- [CLI](docs/cli.md)
- [Configuration](docs/configuration.md)
- [Security](docs/security.md)
- [Sessions](docs/sessions.md)
- [Customization](docs/customization.md)
- [SDK](docs/sdk.md)
- [Development](docs/development.md)

Provider implementation belongs to the AI package; terminal rendering belongs to the TUI package; AgentHarness belongs to Agent core; Maestro execution belongs to the orchestrator package.

## Status

These pre-transfer drafts were checked against focused upstream source and recorded audits, but they are not certified package contracts yet. Product source has not been transferred; settings/protocol tables, build, examples, links, platforms, package contents, and public installation require post-transfer drift checks and certification.
