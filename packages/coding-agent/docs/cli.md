# CLI

```text
recode [aizen] [options] [@files...] [messages...]
```

`recode` and `recode aizen` select Aizen. `--legacy` selects AgentSession compatibility. The removed `--aizen` flag is an error.

## Routed commands

| Command | Purpose |
|---|---|
| `maestro [tui|service]` | Route to Maestro before foreground runtime startup. |
| `doctor [--json]` | Bounded read-only diagnostics. |
| `pi install`, `remove`, `uninstall`, `update`, `list`, `config` | Pi-compatible package/resource management. |
| `telegram` | Telegram long-polling gateway. |

Use `<command> --help` for package-command details. `pi update` updates installed packages; `recode update` targets Recode itself. Self-update and npm publication remain fail-closed until their release endpoints are explicitly enabled.

## Core options

| Area | Options |
|---|---|
| Model | `--provider`, `--model`, `--models`, `--api-key`, `--thinking` |
| Prompt | `--system-prompt`, repeatable `--append-system-prompt`, positional messages, `@file` |
| Output | `--mode text|json|rpc`, `--print`/`-p`, `--export`, `--list-models`, `--verbose` |
| Session | `--continue`, `--resume`, `--session`, `--session-id`, `--fork`, `--session-dir`, `--no-session`, `--name` |
| Tools | `--no-tools`, `--no-builtin-tools`, `--tools`, `--exclude-tools` |
| Resources | repeatable `--extension`, `--skill`, `--prompt-template`, `--theme`; `--use-theme <name[/name]>` selects the interactive theme for one run without changing settings; corresponding `--no-*` discovery flags |
| Trust/network | `--approve`, `--no-approve`, `--offline`, `--no-context-files` |

Thinking levels are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`; unsupported levels are diagnosed and runtime selection may clamp them to model capabilities.

An allowlist supplied by `--tools` is applied before `--exclude-tools`. Extension-defined long flags are accepted after extensions load; unknown short flags are errors.

## Input and output

`@path` adds text or image input to the initial message. Treat referenced files as data, not trusted instructions. `--print` processes a prompt and exits. JSON and RPC reserve stdout for LF-delimited JSON records; diagnostics must not be parsed as protocol records from another stream.

Session selectors are mutually consequential: continue/resume/path/ID/fork resolution must be tested rather than combined speculatively. Project resources in non-interactive modes follow saved/default trust or explicit trust flags because no trust prompt is available.

Packages from npm, Git, or local paths use upstream-compatible syntax, for example `pi install npm:pi-better-harness`. Installing the global `pi` compatibility command replaces or shadows another globally installed `pi` command.
