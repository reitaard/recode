# Maestro Design

Maestro is the single supervisor for durable full-session processes in `packages/orchestrator`.

## Main parts

- lifecycle service and full-session adapter;
- RPC child-process supervisor;
- authenticated local IPC;
- atomic manifests and retained terminal state;
- attachments, event tails, waiting input, and completion handoff;
- turn leases for one authoritative session mutation;
- Windows Task Scheduler/Job Object and Linux systemd user service;
- TUI dashboard and redacted diagnostics.

## Safety

- IPC uses a private random 256-bit token.
- Unix auth/socket files require private permissions.
- Child environments use an allowlist.
- One interactive owner may mutate; observers are read-only.
- Detached mutation is rejected.
- Read-only sessions run without tools.
- Writers cannot share a worktree; child writers need an explicit sibling worktree.
- Maestro never creates, merges, resets, stashes, or removes worktrees.
- Turn-lease timeout fails closed.

## Lifecycle

The service owns launch, status, waiting input, attach/detach, cancellation, result, and stop. Closing a client does not stop the child. Service stop/restart drains within a deadline; native containment terminates remaining descendants.

## Boundary

Maestro and children retain current-user privileges. Same-user files and processes remain inside the trust boundary. Do not describe Maestro as isolation or sandboxing.
