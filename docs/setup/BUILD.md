# Build and Install

Requires Node `>=22.19.0`.

> **Bootstrap status:** the seven-package root workspace and lockfile are present. `npm install --ignore-scripts` completed with lifecycle scripts disabled. Identity, migration-safety, and relative-import checks pass; TUI and telemetry compile. The build currently stops in AI on an AWS/Smithy type-version mismatch and a fetch-body typing mismatch. Later packages and tests have not run.

## Installed dependencies and validation

The first install used:

```text
npm install --ignore-scripts
```

It added 306 packages and generated `package-lock.json`. Production audit currently reports one high-severity direct finding in `undici@8.5.0`; no automated audit fix or dependency-version change has been applied.

Current local checks:

```text
npm run check:identity
npm run check:migration-safety
npm run check:ts-imports
```

Full build, only when needed or requested:

```text
npm run build
```

The root build uses reviewed checked-in model data and does not refresh provider catalogs. Catalog regeneration is a separate maintenance command and must be reviewed explicitly.

## First standalone build after migration

The first build in the standalone repository is a **from-scratch bootstrap**, not an incremental continuation of an inherited RePi build or release.

The first standalone build was attempted at checkpoint `64f02ac`; it is not yet complete. The bootstrap requirements remain:

1. transfer only approved source inputs;
2. remove or refuse inherited `dist/`, binaries, package tarballs, caches, generated declarations/maps, temporary release directories, and copied package output;
3. approve the new package names, synchronized version line, and canonical package graph;
4. update every connected identity/version file together: root and package manifests, internal dependency ranges, lockfile, coding-agent shrinkwrap or approved install lock, CLI/product metadata, release identity, release manifest inputs, binary metadata, and changelog/release-note headings;
5. use the deterministic build path that consumes reviewed checked-in catalogs without a network refresh;
6. build in a clean environment and inspect all generated diffs before running tests.

The first standalone build must not inherit the migration source's `0.83.x`/`0.84.x` values. Use only the approved standalone bootstrap version `0.1.0` recorded through the [versioning and package-lineage plan](../migration/plans/VERSIONING.md), after availability is verified before publication. All seven workspace and intended public packages in the initial fixed train must agree on that value, including SQLite.

After compilation succeeds, run package tests, repository checks, example compilation, generated-file scans, and package-content inspection. A successful compile alone does not certify installation or release.

Current repair order:

1. approve and align the direct Smithy dependency with the AWS client's resolved type family;
2. repair the Codex fetch-body typing without weakening runtime validation;
3. approve an `undici` security update and regenerate the lockfile;
4. resume the dependency-order build from AI through orchestrator;
5. regenerate the coding-agent shrinkwrap only after the package graph builds.

## Local binary install

```text
npm run recode:install-local
```

This requires a clean source checkout passing release identity. It builds the current platform and installs under the user-local Recode directory. It does not publish, tag, or access a release service.

Options:

```text
--skip-install   skip npm install
--keep-build     retain temporary build output
```

Stop running Recode processes before replacing binaries, especially on Windows where native files may be locked.

## Isolated package candidate

```text
npm run release:local -- --out <absolute-disposable-directory> --force
```

This is costly and destructive only to the chosen output directory. It creates isolated artifacts; it is not publication approval or a complete multi-platform release.
