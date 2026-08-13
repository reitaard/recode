# Platforms

No platform should be called fully supported until the transferred repository passes its recorded build, test, install, native-artifact, and terminal gates.

## Baseline

Node.js must satisfy the root engine floor. Linux, Windows, and macOS require separate CI evidence. Terminal behavior varies by emulator, keyboard protocol, color capability, image protocol, clipboard tools, shell, and Unicode width behavior.

## Windows

Shell selection, process replacement, clipboard/native helpers, file locking, and terminal key conflicts require Windows-specific tests. Stop running Recode before replacing binaries. The standalone `0.1.0` certification ran on Windows x64 with Node `26.5.0`: workspace checks/builds/tests, tarball installation, npm command shims, credential-free CLI help/version/model listing, and the no-addon TUI fallback passed. This is evidence for that environment, not a claim that every Windows terminal is certified.

TUI native addons are deliberately omitted from package contents. The reviewed C sources/builders remain available for future reproducible certification, but no `.node` prebuild is shipped.

## tmux and terminals

Tmux can alter keyboard and image capabilities. Terminal setup is opt-in; preview changes before applying them. Environment detection is advisory, not proof that every terminal version works.

## Termux/Android

Clipboard and release paths have special handling, but Termux publication remains uncertified. Do not advertise an artifact until the dedicated build, dependency, install, and smoke-test lane passes.

## Containers

A container can improve isolation only with deliberate mounts, users, capabilities, networking, credential injection, and cleanup. Recode does not convert an ordinary container invocation into a sandbox.

## Local models

Local model servers are external integrations. Downloads can be very large and are never part of deterministic default tests. Users own model license, server lifecycle, network exposure, resource limits, and API compatibility.
