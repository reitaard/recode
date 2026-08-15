# Changelog

## 0.1.5

- Added the Termux/aarch64 release candidate and a low-noise bundle containing the seven package tarballs, the Termux package, checksums, provenance, and release notes.
- Kept third-party extensions and optional web research outside the core runtime; install web access separately with `pi install npm:pi-web-access`.

## 0.1.4

- Moved the status-area spacer above active indicators, keeping the editor aligned without a trailing gap.
- Preserved safe ANSI colors from direct Bash output while continuing to discard unsafe terminal controls.
- Hardened the Windows global installer’s Git Bash path handling and stale-shim cleanup.

## 0.1.3

- Improved extension loading, terminal-safe ANSI rendering, and source-extension diagnostics.
- Added guarded global migration tooling and automated standalone migration-closure checks.

## 0.1.2

- Added the Pi-compatible `pi` package command while keeping `recode` as the primary application command.
- Improved Windows extension loading reliability.

## 0.1.0

- Established the standalone Recode harness: Aizen, Maestro, workers, memory, sessions, tools, LSP, terminal UI, and seven synchronized private packages.
- Customized the Pi coding harness into the Recode harness with compatibility for the Pi ecosystem.
