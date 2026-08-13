# Release

Recode uses the synchronized private `@reitaard/recode-*` `0.1.0` package train. npm publication and dist-tag mutation are disabled.

## GitHub release boundary

A GitHub release may contain the seven inspected npm-format package tarballs, `SHA256SUMS`, and provenance metadata bound to the exact source commit. It does not imply npm publication or native-binary support.

Before creating a tag or release:

1. require a clean certified source checkout;
2. run `npm run check`, `npm run build`, and deterministic tests;
3. create and inspect all seven tarballs;
4. install them together with lifecycle scripts disabled in an isolated project;
5. verify maintained imports and generated command shims;
6. verify package names, versions, dependency ranges, assets, shrinkwrap, and absence of legacy package dependencies;
7. generate SHA-256 hashes and provenance containing source commit, version, package identities, Node version, and platform limitations;
8. obtain explicit approval for the tag push and GitHub Release mutation.

## Platform statement

The local `0.1.0` lane is certified on Windows x64 with Node `26.5.0`. TUI native addons and platform binaries are omitted. Other operating systems, architectures, native addons, Termux, containers, and external services require separate evidence.

## Safety

- Never move a public tag, replace published assets silently, force-push, or conceal a failed release.
- If release creation is partial, stop and record exact remote state before recovery.
- A build, test, pack, or dry run does not authorize a remote mutation.
- npm publication, trusted publishing, and dist-tag changes require separate policy and approval.
