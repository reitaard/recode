# Use Maestro

> **Pre-transfer status:** Maestro is not executable from this documentation repository. These commands are audited interface references, not currently supported operations; service, recovery, installed-TUI, artifact, and platform behavior require post-transfer certification.

## Service interface

```text
recode maestro service install
recode maestro service start
recode maestro service status
recode maestro service restart
recode maestro service stop
recode maestro service uninstall
```

Development only:

```text
recode maestro service run --supervision manual
```

## Sessions

```text
recode maestro tui [--search <query>]
recode maestro attach <id-or-label>
recode maestro search <query>
recode maestro list
recode maestro spawn --read-only [--cwd <path>] [--label <label>]
recode maestro spawn --write --cwd <sibling-worktree> [--label <label>]
recode maestro status <id>
recode maestro cancel <id>
recode maestro stop <id>
```

- Closing the TUI detaches; the session keeps running.
- Cancel aborts current work without deleting the session.
- Stop is destructive.
- Prefer read-only sessions.
- Concurrent writers require separate sibling worktrees from the same Git repository.

## Health

```text
recode maestro health
recode maestro diagnose
```

If the service is unavailable, check `service status`, then `diagnose`. Do not repeatedly spawn sessions while health is unknown.

Maestro runs as the current user and is not a sandbox.
