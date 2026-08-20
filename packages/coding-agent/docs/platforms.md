# Platforms

No platform should be called fully supported until the transferred repository passes its recorded build, test, install, native-artifact, and terminal gates.

## Baseline

Node.js must satisfy the root engine floor. Linux, Windows, and macOS require separate CI evidence. Terminal behavior varies by emulator, keyboard protocol, color capability, image protocol, clipboard tools, shell, and Unicode width behavior.

## Windows

Shell selection, process replacement, clipboard/native helpers, file locking, and terminal key conflicts require Windows-specific tests. The global installer detects Recode and Node processes using the runtime, warns that unsaved work may be lost, and asks for explicit confirmation before force-closing the process tree and replacing binaries. Declining cancels installation. The standalone `0.1.0` certification ran on Windows x64 with Node `26.5.0`; the `0.1.6` candidate must repeat workspace checks/builds/tests, tarball installation, both npm command shims, credential-free CLI help/version/model listing, extension loading, and the no-addon TUI fallback before release. This is evidence for that environment, not a claim that every Windows terminal is certified.

TUI native addons are deliberately omitted from package contents. The reviewed C sources/builders remain available for future reproducible certification, but no `.node` prebuild is shipped.

## tmux and terminals

Tmux can alter keyboard and image capabilities. Terminal setup is opt-in; preview changes before applying them. Environment detection is advisory, not proof that every terminal version works.

## Termux/Android

The repository contains a dedicated seven-package Termux build lane. It produces a single package named `recode`; it does not bundle third-party extensions, the `librarian` skill, or optional native clipboard/TUI addons. Web research remains optional and is installed separately with:

```text
pi install npm:pi-web-access
```

Build the aarch64 candidate with Docker when `dpkg-deb` is unavailable:

```text
bash scripts/build-termux-release.sh --docker
node scripts/test-termux-package.mjs --root .termux-build/stage
node scripts/generate-termux-release-metadata.mjs \
  --package .termux-build/recode_0.1.6-1_aarch64.deb \
  --output .termux-build \
  --version 0.1.6 \
  --architecture aarch64
```

The candidate is not fully supported or publishable until a real Android/Termux aarch64 device passes installation, upgrade/removal, TUI, session, memory, SQLite, and optional web-access smoke tests. Live providers and external services remain separate certification lanes.

## Containers

A container can improve isolation only with deliberate mounts, users, capabilities, networking, credential injection, and cleanup. Recode does not convert an ordinary container invocation into a sandbox.

## Local models

Local model servers are external integrations. Downloads can be very large and are never part of deterministic default tests. Users own model license, server lifecycle, network exposure, resource limits, and API compatibility.
