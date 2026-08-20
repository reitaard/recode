# Configuration

The current compatibility configuration root is `~/.pi/agent`; project configuration is under `.pi/`. These inherited names remain implementation contracts, not product identity.

## Settings

Global `settings.json` applies to all projects. Trusted project `.pi/settings.json` deep-merges over global settings; arrays replace rather than merge. Invalid settings are reported and must not be silently treated as valid.

Major setting groups include model/thinking/transport, steering and follow-up delivery, compaction/retry, theme/TUI, default tools, images, Markdown, LSP, session directory, HTTP timeouts/proxy, project trust, package/resource lists, editor/shell behavior, and opt-in analytics/telemetry controls. The source `Settings` interface and getters are authority until a generated settings reference is added.

Project settings and executable project resources are ignored until trust is resolved. `defaultProjectTrust` is global-only: `ask` and `never` do not load untrusted resources in headless operation; `always` does. CLI `--approve` and `--no-approve` override one run.

`defaultTools` optionally replaces the standard built-in tool selection for sessions that do not supply CLI or SDK tool overrides. It is an array of built-in tool names (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, `lsp`); an empty array disables built-in defaults. Extension, SDK, Browser, MCP, and worker tools remain available under their own registrations. Trusted project settings replace the global array.

In fullscreen mode, `fullscreenExitOutput` controls shutdown output. `transcript` prints the rendered transcript; `resume-hint` restores the prior terminal screen and leaves only the session resume hint.

## Instructions and prompts

Context discovery loads one `AGENTS.md` or `CLAUDE.md` per directory, beginning with the agent directory and then ancestors through the current directory. `--no-context-files` disables it.

`SYSTEM.md` replaces the normal system prompt; `APPEND_SYSTEM.md` appends. CLI prompt values may be literal text or readable file paths. Project-local prompt resources remain subject to trust.

## Environment

The CLI and RPC entry points set `AI_AGENT=pi` as the generic ecosystem marker identifying Pi-compatible agent processes. They also set `PI_CODING_AGENT=true`, the Pi-specific compatibility marker used by child processes to detect that they run inside the coding agent. Child processes inherit both markers; SDK embedding does not set them automatically.

Provider credentials are documented in [Providers](providers.md). Operational variables still implemented with compatibility names include:

- `PI_OFFLINE`: disable startup network operations;
- `PI_PACKAGE_DIR`: package-directory override;
- `PI_TELEMETRY`: install-telemetry override;
- `PI_SKIP_VERSION_CHECK`: update-check override;
- `PI_CONFIG_DIR` / `PI_ORCHESTRATOR_DIR`: selected integration paths;
- `RECODE_TUI_ESC_TIMEOUT`: milliseconds to wait after a lone Escape before dispatching it; defaults to 100 over SSH and 10 otherwise, and helps preserve split Alt-key input on high-latency terminals;
- `HTTP_PROXY` / `HTTPS_PROXY`;
- `VISUAL` / `EDITOR`;
- Telegram variables documented in [Telegram](telegram.md).

Debug, benchmark, and internal test variables are not stable user configuration. Never put credential values in committed settings, command history, examples, or issue reports.

## Offline behavior

`--offline` and accepted true values of `PI_OFFLINE` disable coding-agent startup network operations such as update/package checks and telemetry. They do not provide an operating-system network sandbox and cannot prevent arbitrary extensions, tools, subprocesses, or provider libraries from networking.
