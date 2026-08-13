# Use Workers

## Choose a worker

| Worker | ID | Use for | Tools |
|---|---|---|---|
| Mayuri | `research` | Public-web research with citations | web search/fetch |
| Levi | `audit` | Focused code, architecture, security, or regression audit | read/search and read-only Git |
| Shiori | `shiori` | Private knowledge discussion and staged memory work | read-only project tools |

All workers may receive read-only `kioku_search` when available. They cannot write memory through delegation.

## In the TUI

```text
/worker
/worker chat <name> [message]
/worker status
/worker cancel <conversation-id>
/worker close <name>
```

`/shiori` also opens Shiori-specific chat/review flows.

## Agent tools

- `delegate` — one short read-only task
- `worker_start` — begin a continuing conversation
- `worker_start_many` — start 2–8 independent conversations
- `worker_message` — continue by full conversation ID
- `worker_status`, `worker_cancel`, `worker_close` — inspect/control

## Rules

- Delegate only a focused task with minimal context.
- Use Mayuri for external research and Levi for local audits.
- Workers do not delegate to other agents.
- Treat reports as supporting evidence and verify important claims.
- Do not automatically retry or replace a failed worker; wait for a new Creator request.
- Use only the active workspace or a sibling worktree from the same Git repository.
