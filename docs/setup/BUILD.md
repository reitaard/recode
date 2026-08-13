# Build and Install

Requires Node `>=22.19.0`.

> The seven-package workspace, lockfile, checks, builds, deterministic tests, tarballs, and isolated lifecycle-disabled installation are certified for the standalone `0.1.0` boundary.

## Installed dependencies and validation

The first install used:

```text
npm install --ignore-scripts
```

It initially added 306 packages and generated `package-lock.json`. Approved dependency repairs aligned `@smithy/types` to `4.16.1` and updated `undici` from `8.5.0` to `8.10.0`; the regenerated lockfile now audits with zero production vulnerabilities.

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

The completed standalone bootstrap followed these requirements:

1. transfer only approved source inputs;
2. remove or refuse inherited `dist/`, binaries, package tarballs, caches, generated declarations/maps, temporary release directories, and copied package output;
3. approve the new package names, synchronized version line, and canonical package graph;
4. update every connected identity/version file together: root and package manifests, internal dependency ranges, lockfile, coding-agent shrinkwrap or approved install lock, CLI/product metadata, release identity, release manifest inputs, binary metadata, and changelog/release-note headings;
5. use the deterministic build path that consumes reviewed checked-in catalogs without a network refresh;
6. build in a clean environment and inspect all generated diffs before running tests.

The standalone build must not inherit deprecated `0.83.x`/`0.84.x` values. All seven workspace packages use the synchronized `0.1.0` train, including SQLite.

After compilation, run package tests, repository checks, example compilation, generated-file scans, and package-content inspection. A successful compile alone does not certify installation or release.

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
