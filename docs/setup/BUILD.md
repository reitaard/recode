# Build and Install

Requires Node `>=22.19.0`.

> The seven-package workspace uses the synchronized `0.1.3` candidate train. Release certification requires checks, builds, deterministic tests, inspected tarballs, and an isolated lifecycle-disabled installation.

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

The first build in the standalone repository is a **from-scratch bootstrap**, not an incremental continuation of an inherited build or release.

The completed standalone bootstrap followed these requirements:

1. transfer only approved source inputs;
2. remove or refuse inherited `dist/`, binaries, package tarballs, caches, generated declarations/maps, temporary release directories, and copied package output;
3. approve the new package names, synchronized version line, and canonical package graph;
4. update every connected identity/version file together: root and package manifests, internal dependency ranges, lockfile, coding-agent shrinkwrap or approved install lock, CLI/product metadata, release identity, release manifest inputs, binary metadata, and changelog/release-note headings;
5. use the deterministic build path that consumes reviewed checked-in catalogs without a network refresh;
6. build in a clean environment and inspect all generated diffs before running tests.

The standalone build must not inherit deprecated `0.83.x`/`0.84.x` values. All seven workspace packages use the synchronized `0.1.3` train, including SQLite.

After compilation, run package tests, repository checks, example compilation, generated-file scans, and package-content inspection. A successful compile alone does not certify installation or release.

## Global migration on Windows

The repository provides `install-global.sh` for a deliberate migration. The script requires Git Bash, a clean `main` checkout, and Node `>=22.19.0`. It backs up `~/.pi/agent`, removes only verified stale global harness shims and packages, certifies and packs all seven packages, smoke-installs the exact artifacts, installs them into the active npm prefix, and verifies the `recode` and `pi` shims.

Close every running harness window. Do not delete `~/.pi/agent`; it contains sessions, settings, credentials, memory, and extensions. From Git Bash in the released Recode checkout, run:

```text
bash ./install-global.sh
```

Open another new terminal and update extension packages:

```text
pi update
recode
```

The global coding-agent installation exposes both `recode` and `pi`, so it may replace an existing upstream `pi` command in the same npm prefix. The script does not publish, tag, or mutate a remote repository.

## Portable candidate

The portable archive installs the same seven-package set under its own `runtime` directory and starts through `recode.cmd` or `pi.cmd`. It is suitable for validation without replacing the global runtime. Release artifacts remain GitHub-only; npm publication is disabled.
