# Named Workers

Recode ships a bounded named-worker directory:

| Stable ID | Name | Role |
|---|---|---|
| `research` | Mayuri | Public-web research and source cross-checking. |
| `audit` | Levi | Read-only code/architecture/security/regression audit. |
| `shiori` | Shiori | Private knowledge discussion and staged memory work. |

Use stable IDs in automation; names and aliases are presentation references.

One-shot delegation returns one bounded result. Conversations have full IDs and explicit start/message/status/cancel/close operations. Multiple independent starts may run concurrently within directory limits. Workers cannot recursively delegate.

There is no default worker timeout unless the host supplies one. Failure/cancellation is reported; Recode does not automatically retry or silently replace a worker with parent work. Important claims remain supporting evidence until verified.

Workspace selection is restricted to the active workspace or a sibling worktree from the same Git common directory. Concurrent writers require separate worktrees, but built-in workers are read-only by role. Conversation history and output are bounded; status exposes state, elapsed time, turn count, and bounded last result—not hidden reasoning.

Workers are focused subordinate tasks inside one foreground session. [Maestro](maestro.md) supervises full independent sessions and has a different lifecycle.
