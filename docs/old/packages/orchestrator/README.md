# @reitaard/repi-orchestrator

Recode Maestro is the Windows/Linux service boundary for durable full-session agents. Aizen remains the ordinary foreground coding-agent runtime; named workers remain lightweight conversations rather than operating-system processes.

## CLI

Use Maestro through the primary Recode command:

```bash
recode maestro tui
recode maestro health
recode maestro list
recode maestro spawn --read-only --cwd /path/to/worktree
recode maestro spawn --write --cwd /path/to/sibling-worktree
```

The full-screen TUI shows service health, live sessions, workspace and branch, elapsed state, current activity, pending input, and bounded latest output. Closing the TUI or using **detach** leaves the selected session running. **Cancel** aborts current work. **Stop** is destructive and requires confirmation in the TUI.

## Native service

Install the current-user service at login:

```bash
recode maestro service install
```

Manage it explicitly:

```bash
recode maestro service start
recode maestro service stop
recode maestro service restart
recode maestro service status
recode maestro service uninstall
```

Linux uses a systemd user unit with `KillMode=control-group`. Windows uses Task Scheduler plus a Job Object host configured with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Both paths enforce one verified service owner and option A restart semantics: planned stop or restart drains sessions within a bounded deadline, then the native ownership container terminates remaining descendants. There is no concurrent fallback watcher.

For foreground development only:

```bash
recode maestro service run --supervision manual
```

## Local security boundary

- Every request and RPC-stream handshake requires a 256-bit token stored in the current user's Maestro directory. The token is never placed in command arguments or protocol responses.
- Unix service directories are private, authentication files and sockets are mode `0600`, and named-pipe creation does not grant all-user read/write access on Windows.
- Maestro children receive only runtime variables, known provider credentials, and explicitly selected integration variables. Add exceptional names with `REPI_MAESTRO_CHILD_ENV_ALLOW=NAME_A,NAME_B`; values are never logged.
- Detached sessions cannot mutate a transcript or workspace. A mutating RPC requires the current interactive approval owner and attachment generation.
- Recode denies a narrow set of catastrophic shell commands targeting filesystem roots, home directories, credential stores, or raw devices.

Maestro and its children still run as the current user and are not a sandbox. Other processes running as the same user remain inside the trust boundary and may be able to read user-owned files, including Maestro's authentication record.

## Workspace safety

- Read-only sessions may share the selected workspace and run without tools.
- Concurrent write-capable sessions require an explicitly selected sibling worktree from the same Git common directory.
- Maestro never creates, merges, resets, stashes, or removes worktrees automatically.
