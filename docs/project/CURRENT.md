# Current State

Recode is a standalone public source repository on `main` at `https://github.com/reitaard/recode`.

## Certified locally

- Seven private `@reitaard/recode-*` packages use the synchronized `0.1.5` candidate version train.
- Root checks, TypeScript validation, dependency-ordered builds, maintained examples, generated-file drift checks, and full deterministic workspace tests pass.
- All seven npm-format tarballs install together with lifecycle scripts disabled in an isolated project; maintained exports and npm command shims pass there.
- Production dependency audit reports zero vulnerabilities.
- Windows x64 with Node `26.5.0` passed the local platform lane.
- TUI native addons are deliberately omitted; JavaScript fallback is the certified package behavior.

## Release boundary

- npm publication and dist-tag mutation are disabled.
- GitHub `v0.1.0` and `v0.1.2` are published. The `v0.1.5` candidate adds the Termux/aarch64 release lane and remains unreleased until certification and explicit remote approval.
- macOS, Linux, Windows arm64, Termux, containers, native addons, live providers, Telegram, Maestro services, local models, and third-party extensions require separate evidence or remain opt-in external boundaries.
- Historical transfer records are retained in Git history and are not normal task context.

## Evidence limits

Verify consequential claims against current source, tests, Git, or runtime evidence. Memory and historical documents may be incomplete or stale.
