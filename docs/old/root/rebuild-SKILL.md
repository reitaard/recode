---
name: rebuild
description: Builds, certifies, versions, and releases the customized Recode repository safely. Use for build, build binary, build Windows, build Linux, build Termux, small-model smoke tests, release candidates, GitHub release preparation, version-bump decisions, or release failure recovery.
---

# Recode build and release

Read [`docs/RECODE_BUILD_RELEASE.md`](../../RECODE_BUILD_RELEASE.md) completely before acting. It is the detailed runbook; this skill is the small-model execution guardrail.

## Readiness-only skill command

A direct `/skill:rebuild` command only loads this skill and prepares the agent. It never executes a build or release in the same turn, even when arguments are supplied.

- `/skill:rebuild`: say the skill is ready and ask whether the Creator wants a build or release.
- `/skill:rebuild build`: ask which target: custom package, all binaries, Windows, Linux, or Termux.
- `/skill:rebuild release`: ask which release scope; the currently permitted scope is local release-candidate certification only.
- `/skill:rebuild build windows` or another target-specific form: acknowledge the family and ask for the exact architecture/scope before execution.

Execute only after a later normal user message clearly selects the requested target or scope. If that reply remains ambiguous, ask one concise clarification. Natural-language build/release requests that are not using `/skill:rebuild` may follow the workspace command contract directly.

## Identity

Treat these as immutable unless the Creator explicitly changes release policy:

- Product-facing name: `Recode`
- Internal manifest product name: `RePi` (`displayName` is `Recode`)
- CLI: `recode`
- Package: `@reitaard/repi-coding-agent`
- Branch: `agent-harness`
- Custom baseline: `c5ab200bc43993d211e1e97baa0c9abd27c0ce79`
- Node: `>=22.19.0`
- Published binaries: Windows x64/arm64, Linux x64/arm64, and Termux Node

Upstream Pi is not the release target. Never rename the product, publish the upstream package, or use upstream source as a Recode release.

## Before any build

Run the read-only preflight:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
node scripts/release-identity.mjs --mode branch
```

Stop if the branch is not `agent-harness`, the tree is dirty for packaging, identity fails, or unrelated changes are present. Preserve other work. Never use reset, checkout, clean, stash, broad staging, force-push, or automatic conflict resolution.

## Select exactly one workflow

### Development build

```bash
npm install --ignore-scripts
npm run build
npm run check
bash ./test.sh
```

Use focused Vitest commands for narrow regressions. Do not run a paid model prompt by default.

### Small-model smoke

First run model-free checks:

```bash
node packages/coding-agent/dist/cli.js --version
node packages/coding-agent/dist/cli.js --help
node packages/coding-agent/dist/cli.js --list-models
node packages/coding-agent/dist/cli.js doctor --json
```

Only after explicit approval, run one bounded prompt on the configured small model and require an exact response such as `Say exactly: ok`. The model may report evidence but must not choose versions, branches, tags, publication, or whether a gate is ignorable.

### Platform binary builds

Interpret platform requests explicitly:

- `build windows` or `build for Windows` means Windows x64 and arm64;
- `build windows x64` means `windows-x64` only;
- `build windows arm64` means `windows-arm64` only;
- `build linux` means Linux x64 and arm64;
- `build linux x64` or `build linux arm64` means that exact target only.

For one target:

```bash
./scripts/build-binaries.sh --platform windows-x64 --out <absolute-output-directory>/windows-x64
```

Use separate output directories when building two targets because the builder clears its selected output directory. Cross-built Windows binaries must be runtime-tested on Windows; a Linux host can verify archive structure and embedded manifest but cannot prove Windows startup.

### Termux package

For an explicit Termux request, build the Node archive into a disposable directory outside the repository:

```bash
./scripts/build-termux-release.sh <absolute-output-directory>/recode-termux-node.tar.gz
```

Verify the archive's release manifest and install it only on an approved Termux device. Do not claim Termux certification from a Linux host build alone.

### Isolated release candidate

Use a confirmed disposable output directory outside the repository; `--force` recursively removes it first:

```bash
npm run release:local -- --out <absolute-output-directory> --force
```

This is the preferred package/Bun/Node certification path. Do not use `--skip-test`, `--skip-install`, or `--skip-bun-install` to claim a green release; those options are diagnostic only. Verify isolated `recode --version`, `--help`, `--list-models`, release manifest/source commit, offline RPC, and separately recorded hashes. The local script does not create the GitHub artifact index or `SHA256SUMS`.

### Stable release

Current policy blocks new releases until a reviewed npm trusted-publishing workflow and idempotent publish helper exist. Do not run `scripts/release.mjs`, `npm run release:patch`, or `npm run release:minor`, create/push a release tag, or publish packages while that gate is open.

After that gate is explicitly closed, first ask whether `/cl` was run on the latest authoritative `agent-harness` commit. Run it if not. Then obtain explicit Creator approval for the exact version and branch/tag push. Before the command, set `repi/product.json.nextStableVersion` to the target and verify the tree again. The script mutates versions/changelogs, regenerates metadata, checks/tests, commits, tags, and pushes.

Policy:

- patch = fixes and compatible additions;
- minor = breaking changes requiring migration;
- major is not allowed by current policy without a new decision;
- stable versions never contain source-commit or development-distance suffixes.

For stable-release certification, the intended configured-provider prompt and interactive startup are mandatory manual gates; they require explicit approval when they may incur provider cost. Model-free checks are sufficient only for local diagnostics.

### GitHub/npm boundary

The GitHub workflow builds exact-tag Windows/Linux/Termux/source assets, checksums them, requires release-preview approval, and stages then publishes a GitHub release. It does not run binary runtime or provider certification; those remain manual gates. It currently has no npm trusted-publishing job. Never substitute local `npm publish`, `npm whoami`, OTP, WebAuthn, or a stored token.

## Failure handling

On the first failure, capture `git status --short`, `git diff --check`, recent log, exact command, and whether a commit/tag/remote workflow exists. Do not rerun a release script after a tag or release push. Do not move or delete tags. Rerun only the exact failed GitHub workflow when the source tag and payload are unchanged and the failure is transient. A public release is immutable; correct it with a new forward-fix version.

For local rollback, stop Recode, retain the previous artifact and SHA-256, install that exact tarball with `npm install --global --ignore-scripts`, then verify version, help, model listing, manifest identity, and offline RPC.

## Reporting

Report each gate as:

```text
operation | command | source commit/version | result | artifact/hash or failure evidence
```

Never call an unrun check passed, never infer remote state from local state, and never expose credentials.
