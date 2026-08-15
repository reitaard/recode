# Build and Install

Requires Node `>=22.19.0`.

> The seven-package workspace uses the synchronized `0.1.5` candidate train. Release certification requires checks, builds, deterministic tests, inspected tarballs, and an isolated lifecycle-disabled installation.

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

The standalone build must not inherit deprecated `0.83.x`/`0.84.x` values. All seven workspace packages use the synchronized `0.1.5` train, including SQLite.

After compilation, run package tests, repository checks, example compilation, generated-file scans, and package-content inspection. A successful compile alone does not certify installation or release.

## Global migration on Windows

The repository provides `install-global.sh` for a deliberate migration from Git Bash and `install-global.ps1` for machines without Bash. Both require a clean `main` checkout and Node `>=22.19.0`. They back up `~/.pi/agent`, remove only verified stale global harness shims and packages, certify and pack all seven packages in an isolated temporary Git clone, smoke-install the exact artifacts, install them into the active npm prefix, and verify the `recode` and `pi` shims.

Each installer detects running Recode/Node processes, warns that unsaved work may be lost, and asks before force-closing the process tree. Declining cancels the installation. Do not delete `~/.pi/agent`; it contains sessions, settings, credentials, memory, and extensions. From Git Bash in the released Recode checkout, run:

```text
bash ./install-global.sh
```

From PowerShell when Bash is unavailable, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-global.ps1
```

Open another new terminal and update extension packages:

```text
pi update
recode
```

The global coding-agent installation exposes both `recode` and `pi`, so it may replace an existing upstream `pi` command in the same npm prefix. The script does not publish, tag, or mutate a remote repository.

## Termux candidate

Build the aarch64 package and the low-noise release bundle from the repository root:

```text
bash scripts/build-release-bundle.sh --docker
```

The bundle contains all seven package tarballs, the Termux `.deb`, `SHA256SUMS`, `PROVENANCE.json`, and release notes. It does not bundle third-party extensions or optional web access.

## Portable candidate

The portable archive installs the same seven-package set under its own `runtime` directory and starts through `recode.cmd` or `pi.cmd`. It is suitable for validation without replacing the global runtime. Release artifacts remain GitHub-only; npm publication is disabled.
