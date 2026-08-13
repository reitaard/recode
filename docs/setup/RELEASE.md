# Release

> **Pre-transfer status:** no standalone release command, repository identity, publication graph, CI route, or trusted-publishing setup is active in this repository. The inherited source workflow is evidence only and must be redesigned and certified after transfer. Nothing here authorizes versions, commits, tags, pushes, npm publication, or GitHub Releases.

## Intended standalone contract

- Follow the from-scratch bootstrap in [Build and Install](BUILD.md#first-standalone-build-after-migration).
- Use the Creator-selected custom bootstrap version on the synchronized `@reitaard/recode-*` workspace train; never continue or reuse inherited/deprecated `0.83.x`/`0.84.x` values.
- Keep one canonical seven-package graph and publication train, including SQLite, synchronized at `0.1.0` for the standalone bootstrap.
- Make package manifests, dependency ranges, lockfiles, CLI metadata, changelogs, release manifests, artifacts, and tag expectations agree.
- Use deterministic reviewed catalogs for release builds; network refresh is separate and opt-in.
- Bind artifacts to the exact version, source commit, package identities, hashes, and upstream integration provenance.
- Require credential-free checks, package-content inspection, isolated local-tarball installation, and separate platform/native certification before publication.

## Inherited workflow requiring replacement

The audited source repository contains release scripts, identity policy, tag-triggered CI, trusted npm publishing, artifact manifests, and GitHub Release staging. Its branch/root/product identity, `repi/product.json`, package names, package set, version line, repository defaults, and remote permissions are not standalone contracts and must not be activated unchanged.

After transfer, rewrite and test those facilities behind fail-closed standalone identity. Only then may permanent operator commands be documented here.

## Safety

- Never use a guessed, deprecated, or previously published version.
- Never move a public tag, replace public assets, force-push, or reset to conceal failure.
- Never make publication manual fallback for a failed trusted workflow without a separately reviewed recovery procedure.
- If publication is partial, stop, record the state, and recover with a new approved synchronized version.
- A local build, dry run, or passing test does not authorize release.
- Registry queries, trusted-publishing setup, commits, tags, pushes, releases, publication, and dist-tag changes each require explicit approval.
