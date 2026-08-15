# Release

Recode uses the synchronized private `@reitaard/recode-*` `0.1.5` package train. npm publication and dist-tag mutation are disabled.

## GitHub release boundary

A GitHub release should prefer one low-noise `recode-0.1.5-bundle.tar.gz` asset containing the seven inspected npm-format package tarballs, the Termux/aarch64 `.deb`, `SHA256SUMS`, provenance metadata, and release notes bound to the exact source commit. Keep a standalone bundle checksum beside it when convenient. It does not imply npm publication or native-binary support.

Before creating a tag or release:

1. require a clean certified source checkout;
2. run `npm run check`, `npm run build`, and deterministic tests;
3. create and inspect all seven tarballs;
4. install them together with lifecycle scripts disabled in an isolated project;
5. verify maintained imports and generated `recode`, `pi`, and `recode-maestro` command shims, including distinct bare-update behavior;
6. verify package names, versions, dependency ranges, assets, shrinkwrap, and absence of legacy package dependencies;
7. generate SHA-256 hashes and provenance containing source commit, version, package identities, Node version, and platform limitations;
8. build and smoke-test the low-noise bundle, verifying its seven package tarballs, Termux package, manifest, checksums, and provenance;
9. obtain explicit approval for the tag push and GitHub Release mutation.

## Platform statement

The `0.1.5` candidate must be certified on Windows x64 with Node `26.5.0` before release. The Termux/aarch64 package remains a separate candidate until a real device passes its install, upgrade/removal, TUI, session, memory, SQLite, and optional web-access smoke tests. TUI native addons and platform binaries are omitted; other operating systems, architectures, containers, and external services require separate evidence.

## Command ownership

The coding-agent tarball exposes both `recode` and `pi`. A global installation may replace or shadow an existing upstream `pi` executable; disclose this prominently and never describe the two global commands as safely co-installable. `pi update` updates installed packages, while `recode update` targets Recode itself.

## Safety

- Never move a public tag, replace published assets silently, force-push, or conceal a failed release.
- If release creation is partial, stop and record exact remote state before recovery.
- A build, test, pack, or dry run does not authorize a remote mutation.
- npm publication, trusted publishing, and dist-tag changes require separate policy and approval.
