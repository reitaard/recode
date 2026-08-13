# `@reitaard/recode-orchestrator`

Recode Maestro service supervision and live-session TUI. Maestro owns durable **full Aizen session processes**; it is separate from the lightweight named-worker tools that run bounded tasks inside an Aizen session.

Node `>=22.19.0` is required. This documentation is staged before source transfer and does not certify publication or native service installation from this repository.

## Entry points

| Entry point | Purpose |
|---|---|
| `@reitaard/recode-orchestrator` | Lifecycle, service, IPC, supervisor, storage, dashboard, workspace, completion, and diagnostic APIs |
| `@reitaard/recode-orchestrator/cli` | Executable Maestro CLI |
| `recode-maestro` | Package binary mapped to the CLI build |

Most users enter through `recode maestro`, which coding-agent routes to this package.

## Service operations

```text
recode maestro service install
recode maestro service start
recode maestro service status
recode maestro service restart
recode maestro service stop
recode maestro service uninstall
```

Development/manual ownership:

```text
recode maestro service run --supervision manual
```

Native current-user service management supports:

- Linux: systemd user service;
- Windows: Task Scheduler with descendant containment through the current native ownership path.

macOS native service management is not implemented. `serve` and internal supervision modes are implementation-facing commands; ordinary users should prefer `service` operations.

## Sessions and dashboard

```text
recode maestro tui [--search <query>]
recode maestro attach <session-id-or-label>
recode maestro search <query>
recode maestro list
recode maestro spawn (--read-only | --write) [--cwd <path>] [--label <label>] [--parent <id>]
recode maestro status <id>
recode maestro cancel <id>
recode maestro stop <id>
```

Closing the dashboard detaches without stopping the child. `cancel` aborts current work while preserving the supervised session. `stop` is destructive.

The service owns launch, state projection, waiting input, attach/detach, cancellation, result, and stop. A turn lease prevents concurrent authoritative mutation and fails closed on timeout.

## Workspace admission

Prefer read-only sessions. They launch without tools and reject mutating RPC operations.

Write-capable sessions receive a canonical workspace receipt. Two active writers cannot own the same worktree. A write-capable child of a write-capable parent must be given an explicit sibling worktree belonging to the same Git common directory.

Maestro verifies and admits workspaces; it never creates, merges, resets, stashes, or removes worktrees.

## IPC and process security

Local IPC is authenticated with a random 32-byte token. On Unix, auth/socket material is checked for private permissions. Child environments are constructed from an allowlist plus explicit Maestro workspace state rather than blindly inheriting every parent variable.

This is a current-user trust boundary, not a sandbox. Maestro and its child processes retain the user's OS privileges. Same-user processes and files remain trusted. Do not use read-only mode as a claim of OS isolation.

## RPC and diagnostics

```text
recode maestro health
recode maestro diagnose
recode maestro rpc <instance-id> <json-command>
recode maestro rpc-stream <instance-id>
```

`rpc-stream` accepts JSONL coding-agent RPC commands or extension UI responses on stdin and writes child responses to stdout. Treat it as a low-level integration interface; malformed JSON terminates through normal CLI error handling.

Diagnostics are bounded and should redact known sensitive fields, but operational bundles and logs can still contain workspace or process metadata. Handle them as sensitive artifacts.

## Completion handoff

The completion queue provides bounded records, summary truncation, delivery, and deduplication behavior for completed detached work. It is not certified as crash-safe across service restart: the focused restart-recovery test at the audited upstream checkpoint `fbd6b5b3` expected one durable queue record and observed none.

Do not promise restart recovery until that defect is repaired and the isolated test passes.

## Deliberate exclusions

Maestro does not provide:

- named-worker delegation semantics;
- OS/container sandboxing;
- automatic worktree mutation;
- macOS native service support;
- absent Phase 4 target routing;
- the removed attach UI or RPC bridge;
- certified crash-safe completion recovery.

## Build and test

After source transfer:

```sh
npm run build -w @reitaard/recode-orchestrator
npm exec vitest -- --run packages/orchestrator/test
```

The package currently declares no `test` script; the root repository must own the exact invocation or one must be added deliberately. At the audited upstream checkpoint `fbd6b5b3`, 71 of 72 tests passed. The sole failure was completion restart recovery, described above. Build and service-install tests must be rerun after standalone identity and release assets are rewritten.
