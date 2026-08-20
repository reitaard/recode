# Changelog

## [Unreleased]

## [0.1.6]

- Added configurable default tools, per-run theme selection, fullscreen exit output, transcript-search styling, and visible managed-tool startup progress.
- Improved model-catalog refresh coordination, JSON/RPC streaming usage, fallback extension-tool output, and deferred-tool integration.

## [0.1.5]

- Added the Termux/aarch64 release candidate and low-noise bundle packaging.
- Kept Mayuri web access optional; install `npm:pi-web-access` separately when needed.

## [0.1.4]

- Moved the status-area spacer above active indicators, keeping the editor aligned without a trailing gap.
- Preserved safe ANSI colors from direct Bash output while continuing to discard unsafe terminal controls.

## [0.1.3]

- Improved extension loading, terminal-safe ANSI rendering, and source-extension diagnostics.
- Added guarded global migration tooling and migration-closure checks.

## [0.1.2]

- Added the Pi-compatible `pi` package command while keeping `recode` as the application command.

## [0.1.0]

- Established the standalone Recode coding harness with Aizen, Maestro, workers, memory, sessions, tools, and LSP.
- Customized the Pi coding harness into the Recode harness with Pi ecosystem compatibility.
