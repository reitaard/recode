# Recode Coding Agent

The coding-agent package integrates Recode's CLI, interactive terminal application, Aizen runtime, legacy AgentSession compatibility runtime, resource system, SDK, headless protocols, workers, memory, Maestro routing, and Telegram gateway.

Recode is distributed through certified GitHub release artifacts; npm publication remains disabled.

`recode` is the primary application command. The additional `pi` compatibility command manages packages from the existing Pi ecosystem, allowing upstream installation instructions such as `pi install npm:pi-better-harness` to work unchanged. Globally installing this command replaces or shadows any existing upstream `pi` executable.

## Runtime modes

- `recode` and `recode aizen` start Aizen, backed by `AgentHarness`.
- `recode --legacy` selects the retained AgentSession compatibility runtime.
- `--print` runs one non-interactive request.
- `--mode json` emits session events as JSONL.
- `--mode rpc` accepts commands and emits responses/events as JSONL.
- `recode maestro`, `doctor`, package commands, and `telegram` route to dedicated command handlers.
- `pi install`, `remove`, `uninstall`, `list`, `config`, and `update` use the same package manager; bare `pi update` updates installed packages, while bare `recode update` targets Recode itself.

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

## Distribution boundary

The package remains private on npm. Use inspected GitHub release artifacts. Native TUI addons are omitted until separately certified.
