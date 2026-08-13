# Changelog

## [Unreleased]

### Added

- Added Recode Maestro's versioned public lifecycle contract, bounded supervision service, and private worker/full-session adapters.
- Added direct Maestro session attachment by unambiguous id or label, plus bounded session search and prefiltered dashboard entry across ids, labels, workspaces, and branches.
- Added validated atomic instance/machine manifests with bounded backup recovery, corruption diagnostics, process-start identity verification, and terminal retention.
- Added bounded RPC deadlines, command/instance cancellation results, prompt/request/session/subscriber limits, and verified graceful-to-forced shutdown outcomes.
- Added fail-closed per-session turn leases with FIFO serialization, stale-generation-safe release, and compaction/session-rotation rebind.
- Added exclusive interactive attachments, concurrent read-only streams, non-destructive detach, durable waiting-input replay, bounded event tails, and receipt-verified restart reconnect.
- Added a bounded durable completion queue with generation-safe claims, idempotent acknowledgement, restart delivery, and explicitly untrusted Aizen handoffs at idle turn boundaries.
- Added canonical unmanaged workspace receipts, read-only no-tool sessions, exclusive write-worktree admission, sibling-worktree verification, and receipt-verified reconnect.
- Added verified single-owner Maestro service supervision, persisted readiness and restart diagnostics, systemd cgroup containment, Windows Job Object containment, bounded planned shutdown, and degraded-adapter health.
- Added the modern minimal Maestro board with live service health, workspace-aware session activity, bounded output, interactive attach/detach, pending-input handling, cancel, and confirmed stop actions.
- Integrated the versioned full-session lifecycle service and adapter as the production launch, cancellation, attachment, waiting-input, result, and stop authority.
- Added authenticated IPC request/stream handshakes, private Unix socket/authentication modes, restricted Windows named-pipe access flags, and a filtered child-environment policy with explicit integration overrides.
- Added one fail-closed lifecycle state projection across IPC, service health, and the Maestro board, including explicit divergence diagnostics.
- Added an offline redacted Maestro diagnostic bundle with release/runtime identity, bounded health and restart evidence, and hashed child/workspace identities.

### Changed

- Raised the bounded default Maestro live-session capacity from eight to ten for the measured V2 multi-session target.

### Fixed

- Extended the native Maestro readiness deadline to 60 seconds so cold Windows service startup cannot report a false failure while the service is still booting.
- Prevented detached native-service stdout/stderr pipes from turning harmless `EPIPE` output failures into Maestro crashes.
- Guarded best-effort RPC writes against child-pipe `EPIPE` races during cancellation, UI responses, and child shutdown.
- Resolved the coding-agent RPC entry through its ESM export so Node-based child startup works.
- Spawned compiled Maestro sessions through the Recode companion executable instead of the obsolete upstream Pi filename.
- Retained cancelled, failed, and recovered terminal instance records instead of deleting them during shutdown.
- Prevented timed-out requests, stale command IDs, stale attachments, hung children, and throwing observers from corrupting or indefinitely blocking Maestro lifecycle control.
- Wired real child terminal transitions to exactly one durable completion record before parent delivery and acknowledgement.
- Rejected detached mutating RPC commands unless they carry the current interactive owner and attachment generation.
- Replaced unavailable-service stack traces with a concise command to start Maestro.
- Hid the Windows scheduled-task host and child process instead of opening a visible Maestro console window.
- Gave cold session spawn and mutating IPC requests operation-specific deadlines instead of the five-second control-plane deadline.
- Made native install, start, and restart wait for verified Maestro readiness, projected stale health as stopped or unexpectedly exited, and classified unexpected signals as crashes under native supervision.

## [0.81.4] - 2026-07-22

## [0.80.6] - 2026-07-09

## [0.80.5] - 2026-07-09

## [0.80.4] - 2026-07-09

## [0.80.3] - 2026-06-30
