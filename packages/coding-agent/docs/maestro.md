# Maestro Integration

`recode maestro ...` routes before foreground Aizen startup to a sibling compiled `recode-maestro` binary, workspace orchestrator CLI, or installed orchestrator entry. Coding-agent owns only this routing and completion handoff; `@reitaard/recode-orchestrator` owns service/session behavior.

Representative operations include service install/start/status/restart/stop/uninstall, session TUI/list/search/attach/spawn/status/cancel/stop, and health/diagnose. Exact commands must match the orchestrator package documentation after transfer.

Maestro runs as the current user and is not a sandbox. Prefer read-only sessions. Writable concurrent sessions require separate sibling worktrees from the same Git repository. Cancel aborts active work; stop is destructive; closing the TUI detaches rather than stopping a session.

Completion handoff is represented in RPC and coding-agent integration, but crash-safe completion restart recovery remains uncertified. Do not promise durable delivery until the orchestrator defect is repaired and tested.
