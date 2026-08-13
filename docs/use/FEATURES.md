# Recode Features

Use this map to find the smallest relevant guide.

| Feature | Purpose | Read next |
|---|---|---|
| Aizen | Main coding agent and Manager | [Design](../project/DESIGN.md) |
| Workers | Focused research, audit, and private knowledge conversations | [Worker use](../workers/USE.md) |
| Memory | Project/global recall and reviewed durable knowledge | [Worker memory](../workers/MEMORY.md) |
| Maestro | Durable full-session processes | [Maestro use](../maestro/USE.md) |
| LSP | Definitions, references, symbols, diagnostics, and edits | [Coding-agent docs](../../packages/coding-agent/docs/index.md) |
| MCP and packages | Optional external tools, providers, and services | [Packages](../../packages/coding-agent/docs/packages.md) |
| Doctor | Read-only product diagnostics | `recode doctor` or `recode doctor --json` |
| Sessions | Resume, continue, fork, export, and RPC modes | [Sessions](../../packages/coding-agent/docs/sessions.md) |

## Common commands

```text
recode                    Start Aizen interactively
recode -p "task"          Run one prompt and exit
recode doctor             Check product health
recode maestro tui        Open Maestro
```

Inside the TUI:

```text
/worker                   Open worker controls
/memory                   Open memory controls
/shiori                   Run or open Shiori workflows
/teach                    Control staged memory teaching
```

Exact options must be checked against `recode --help`; installed binaries on another machine may lag behind source.

## Boundaries

- Workers provide bounded specialist results; Aizen remains Manager.
- Memory can be stale or incomplete and never overrides verified state.
- Maestro supervises full sessions; it is not a sandbox.
- LSP and integrations may be unavailable without local dependencies or configuration.
