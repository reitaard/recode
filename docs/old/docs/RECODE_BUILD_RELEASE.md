# Recode build and release runbook

This is the authoritative build, certification, release, and recovery procedure for this customized Recode repository.

## Product and release authority

- Product-facing name: **Recode**
- CLI: `recode`
- Published package identity: `@reitaard/repi-coding-agent`
- Internal manifest product name: `RePi` (`displayName` is `Recode`)
- Release branch: `agent-harness`
- Custom baseline: `c5ab200bc43993d211e1e97baa0c9abd27c0ce79`
- Required Node.js: `>=22.19.0`
- Binary builder: Bun `1.3.14` in GitHub Actions
- Supported published binary targets: Windows x64/arm64 and Linux x64/arm64
- Additional published runtime: Termux Node archive

Upstream Pi is an integration source, not the Recode release authority. Never change the product name to `pi`, publish the upstream package, or use an upstream tag as a Recode release.

The current checkout must pass `scripts/release-identity.mjs` before packaging. That check verifies the branch, custom ancestry, clean tree, package names, and lockstep versions.

## Choose the operation first

Do not combine these operations:

| Operation | Mutates | Approval needed |
| --- | --- | --- |
| Development build | repository build outputs | normal task approval |
| Isolated release candidate | temporary directory outside the repository | explicit before running a costly full gate |
| Stable version/tag preparation | versions, changelogs, commits, local tag, remote refs | currently blocked; explicit Creator approval is still required after the block is removed |
| GitHub release | GitHub artifacts and release state | explicit release-preview approval |
| npm publication | public package registry | blocked until reviewed trusted publishing exists |
| Fleet installation | user or remote machines | separate explicit deployment approval |

A successful dry run, an existing tag, or a previous release is not approval for a new mutation.

**Current release block:** `AGENTS.md` prohibits starting a new release until a reviewed npm trusted-publishing workflow and idempotent publish helper exist. Local builds and certification may proceed, but do not run `scripts/release.mjs`, create/push a new release tag, or publish packages while that gate is open.

## Non-negotiable safety rules

1. Read `AGENTS.md` and `OPERATIONS.md` before release or packaging work.
2. Check the branch and tree before doing anything:

   ```bash
   git status --short
   git branch --show-current
   git rev-parse HEAD
   node scripts/release-identity.mjs --mode branch
   ```

3. Packaging and release require a clean `agent-harness` checkout. If unrelated work is present, stop and preserve it. Do not use `git reset --hard`, `git checkout .`, `git clean`, `git stash`, a broad `git add`, force-push, or an automatic conflict resolution.
4. Never place credentials, provider keys, npm tokens, or GitHub tokens in this repository, an artifact, or a log.
5. Use `npm install --ignore-scripts` or `npm ci --ignore-scripts`. Do not enable lifecycle scripts merely to make a release pass.
6. Do not run a paid provider prompt without explicit approval. `--version`, `--help`, `--list-models`, Doctor, offline RPC, and package inspection are the default model-free checks.
7. A failed release command is evidence, not permission to repeat it. Inspect the tree, tag, commits, and workflow state before deciding the next action.

## Development build

Install dependencies without lifecycle scripts:

```bash
npm install --ignore-scripts
```

Build all packages:

```bash
npm run build
```

Run the authoritative repository check after source changes:

```bash
npm run check
```

Run the non-e2e test gate from the repository root:

```bash
bash ./test.sh
```

On Windows, invoke `test.sh` through Git Bash or another Bash implementation. Do not hand `./test.sh` to `cmd.exe`.

For a narrow test, run the package-local Vitest binary from that package, for example:

```bash
cd packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/footer-width.test.ts
```

The root build can regenerate live model catalogues. That is expected for an intentional catalogue update but is unrelated churn for a coding-agent-only change. Inspect generated diffs before committing or packaging.

## Small-model smoke procedure

Small models are useful for deterministic control-plane checks, not for authorizing a release. Keep the model task narrow and require exact output.

1. Build and run model-free checks first:

   ```bash
   node packages/coding-agent/dist/cli.js --version
   node packages/coding-agent/dist/cli.js --help
   node packages/coding-agent/dist/cli.js --list-models
   node packages/coding-agent/dist/cli.js doctor --json
   ```

2. Select a configured small model only in the local test configuration. Do not write credentials into files or command lines.
3. If a real provider call is explicitly approved, use one bounded prompt such as `Say exactly: ok`. Record the selected model, source commit, exit status, and exact response; do not treat a verbose or approximate answer as success.
4. Test interactive startup separately from the provider prompt. Verify that startup, MCP, Kioku, worker, Maestro, and clipboard behavior does not depend on the model completing a complex task.
5. Never let a small model decide the version, target branch, tag name, publication destination, or whether a failed gate should be ignored. The model may summarize evidence; the Creator controls mutation.

## Isolated local release candidate

This is the preferred pre-tag gate. It builds packages, creates tarballs, builds the current-platform Bun binary, and installs Node/Bun copies outside the repository.

Use an output directory outside the checkout. `--force` recursively removes that output directory first, so confirm it is disposable and contains no unrelated artifacts:

```bash
npm run release:local -- --out <absolute-output-directory> --force
```

Useful diagnostic options are `--skip-test`, `--skip-install`, and `--skip-bun-install`. They are not release acceptance gates. Do not use them to claim a certified release.

The normal run performs:

1. `npm run check`
2. clean and `npm run build:release`
3. `bash ./test.sh`
4. release-manifest generation
5. package tarballs
6. isolated npm installation with `--ignore-scripts`
7. isolated Bun installation and current-platform binary testing

Run the isolated artifacts from outside the repository. Replace `<out>` with the actual output path printed by the script.

```bash
<out>/node/recode --version
<out>/node/recode --help
<out>/node/recode --list-models
<out>/bun/recode --version
<out>/bun/recode --help
<out>/bun/recode --list-models
```

On Windows, use the generated `.cmd` launchers or the executable path through PowerShell. Also verify:

- `recode-release.json` has `displayName: "Recode"`, `product.name: "RePi"`, the expected package, version, source commit, and custom baseline;
- installed runtime trees match the built source where the release gate requires parity;
- configured RPC starts offline;
- interactive startup is usable;
- one approved small-model prompt returns the exact expected response;
- the artifact SHA-256 is recorded. `scripts/local-release.mjs` does not create the GitHub `recode-artifacts.json` index or `SHA256SUMS`; hash local tarballs separately with `sha256sum` or PowerShell `Get-FileHash`.

The local release script must not be used as a substitute for the GitHub multi-platform build. A local macOS build, if the helper happens to accept it, is not evidence for the published support matrix.

## Binary and Termux builds

The multi-platform builder creates deterministic extracted directories and archives. Run it from Bash and keep output outside the repository when testing locally:

```bash
./scripts/build-binaries.sh --out <absolute-output-directory>
```

The supported archive set is:

```text
recode-linux-x64.tar.gz
recode-linux-arm64.tar.gz
recode-windows-x64.zip
recode-windows-arm64.zip
recode-termux-node.tar.gz
```

For a local platform-only diagnostic build:

```bash
./scripts/build-binaries.sh --platform windows-x64 --out <absolute-output-directory>
```

`--skip-build` and `--skip-deps` are only for investigating an already-built directory. A tagged release must perform a fresh build; the script rejects `--skip-build` for tagged artifacts.

The Termux archive requires Node.js `>=22.19.0` on the device. Its documented setup is:

```sh
pkg install nodejs-lts git bash ripgrep fd
tar -xzf recode-termux-node.tar.gz
./recode/install
./recode/recode
```

## Release-candidate acceptance gate

Do not tag until all applicable items have evidence from the exact clean commit:

- `node scripts/release-identity.mjs --mode branch` passed;
- all publishable packages are lockstep and use the Recode package names;
- `npm run check` passed;
- `bash ./test.sh` passed, or every host-specific failure is documented and explicitly accepted as a blocker exception;
- isolated Node package passed version, help, model-listing, offline-RPC, and manifest checks;
- Bun/binary artifacts passed the same checks for every built target;
- Termux archive was extracted and its installer/runtime checked on a supported device when that target is claimed;
- the GitHub payload's `recode-release.json`, `recode-artifacts.json`, and `SHA256SUMS` verify together. Local release candidates have a manifest and separately recorded hashes, but not this complete index unless it is generated manually;
- interactive startup, MCP/Kioku, worker modal behavior, Maestro control, clipboard behavior, and updater identity refusal were checked where applicable;
- one real prompt using the intended configured provider and release model passed. This is mandatory for stable-release certification, but requires explicit approval because it may incur provider cost; it is optional for model-free/local diagnostics;
- the prior release artifact and rollback procedure are identified.

Record durable release evidence in `update/LOG.md` and update `update/CONTEXT.md` or `update/PLAN.md` when the release changes stable operational facts or gates.

## Version-bump policy

This repository uses lockstep versions for its publishable packages.

Before release preparation, ask whether `/cl` was run on the latest authoritative `agent-harness` commit. If not, run `/cl` first and review the changelog output. Do not proceed on an unreviewed or stale changelog.

- **Patch**: fixes and backward-compatible additions. Example: `0.82.1` to `0.82.2`.
- **Minor**: breaking changes requiring migration. Example: `0.82.1` to `0.83.0`.
- **Major**: not part of the current release policy. Do not select it without a separate explicit policy decision.
- Do not encode source commits or development distance in a stable SemVer version. The release manifest carries provenance.
- Do not bump a version merely to test a local build; use the existing version and an artifact/source manifest.

Before invoking the release script, set `repi/product.json.nextStableVersion` to the exact target version in a reviewed committed change. `scripts/release.mjs` refuses to proceed when the requested bump does not match that declaration. Do not manually edit each workspace package; the release script calls the lockstep version command and regenerates the required lock/shrinkwrap files.

The release script also moves each package `CHANGELOG.md` `[Unreleased]` section, regenerates release artifacts, runs checks/tests, commits the release, creates the tag, adds the next `[Unreleased]` sections, and pushes the branch and tag. It is therefore a high-impact mutating command. It remains blocked by the current npm trusted-publishing policy; the commands below are future-only until that policy gate is explicitly closed.

Only run it after the trusted-publishing gate is closed and explicit approval exists for the exact target and push:

```bash
npm run release:patch
npm run release:minor
```

The script accepts explicit versions and `major`, but the policy above is authoritative. Do not rerun it after a tag or release has been pushed.

## GitHub release sequence

`.github/workflows/build-binaries.yml` is the GitHub release authority for binary/source assets.

1. The exact `vX.Y.Z` tag is checked out; the workflow does not accept a separate source revision.
2. Release identity is verified against the tag.
3. Linux and Windows binaries and the Termux archive are built from that tag.
4. The workflow creates the release manifest, source archive, artifact index, and SHA-256 file.
5. The release payload is uploaded as a workflow artifact.
6. The `release-preview` environment approval is required.
7. A draft GitHub release is created and its asset names are validated.
8. The draft is published only after the staged checks pass.

Expected release payload includes:

```text
recode-linux-x64.tar.gz
recode-linux-arm64.tar.gz
recode-windows-x64.zip
recode-windows-arm64.zip
recode-termux-node.tar.gz
recode-source.tar.gz
recode-release.json
recode-artifacts.json
SHA256SUMS
RELEASE_NOTES.md
```

The workflow currently publishes GitHub assets only. It has no npm trusted-publishing job. Do not substitute local `npm publish`, `npm whoami`, an OTP, WebAuthn, or a manually stored npm token. npm publication remains blocked until a reviewed GitHub OIDC/trusted-publishing workflow exists and its idempotency is tested.

The workflow does not run binary `--version`, `--help`, model-listing, RPC, interactive, or provider tests. Those are separate manual/post-artifact certification gates and must not be inferred from a green workflow.

If a workflow fails for a transient reason, inspect the exact tag, commit, run, and uploaded payload before rerunning that workflow. Never rebuild a public tag from a different commit.

## Failure recovery and rollback

### Before a release commit or tag

Stop at the first failure. Inspect:

```bash
git status --short
git diff --stat
git diff --check
git log -5 --oneline --decorate
```

Keep or fix the release-script changes deliberately. Do not reset, stash, clean, or delete generated files broadly. If the tree contains unrelated work, preserve it and ask for a clean release checkout.

### After the release commit or local tag exists

Do not rerun `release.mjs`. Verify which commits and refs exist:

```bash
git show --stat --oneline <commit>
git rev-parse --verify refs/tags/vX.Y.Z
```

If the second changelog commit was not created, stop and obtain Creator review before completing it. Never delete or move the tag to hide a partial local release.

### After branch or tag push

Do not amend, force-push, or recreate the tag. Inspect GitHub Actions and the draft/public release. A failed build from the exact tag may be rerun if the failure is transient; a source or packaging defect requires a new forward-fix version. This state should only be reachable after the current trusted-publishing release block has been removed.

If a GitHub release is already public, do not mutate its assets. Publish a corrected patch release instead.

### npm partial publication

The publication helper is designed to skip package versions already present and validate package contents before publishing missing packages. If publication is ever enabled and stops part-way through, retain the exact tag and logs, verify which packages already exist, and resume only through the reviewed trusted workflow. Do not run the release script again for the same version.

### Local installation rollback

Retain the previous certified tarball and its SHA-256 before replacing a global install. Install that exact local artifact with lifecycle scripts disabled only after stopping the running Recode process:

```bash
npm install --global --ignore-scripts <previous-certified-tarball.tgz>
```

On Windows, a running Recode process can hold the clipboard native module open. Stop/restart it before replacing or retiring an installation. Verify the rollback with `--version`, `--help`, `--list-models`, release identity, and offline RPC before considering it complete.

For source-local development, `npm run recode:install-local` installs the current clean checkout's platform binary and updates the user launcher; it is not a release rollback and it does not publish or tag.

## Evidence format for a small model or future agent

Report one line per gate with:

```text
operation | command | source commit/version | result | artifact/hash or failure evidence
```

Use exact command output for version, identity, checksum, and prompt assertions. Do not summarize a failed gate as passed, and do not infer remote state from local Git state.
