# Root Transfer Inventory

Source: `../re.pi` at `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`.

This is the path-level root inventory. Package contents are classified in [TRANSFER.md](PACKAGES.md), and exact workflow risks and pre-activation gates are classified in [WORKFLOWS-INVENTORY.md](WORKFLOWS.md). Transfer remains subject to Creator approval and identity rewriting.

## Root files

| Source path | Disposition | Reason or required action |
|---|---|---|
| `.gitattributes` | transfer | Repository text/binary behavior; review after copy. |
| `.gitignore` | transfer and rewrite | Preserve relevant generated/private exclusions; remove source-only paths and add standalone outputs. |
| `.npmrc` | transfer after review | Required npm behavior; must not contain credentials or source-only registry policy. |
| `biome.json` | transfer | Root formatting/check input. |
| `tsconfig.base.json`, `tsconfig.json` | transfer and rewrite | Build/typecheck inputs; remove excluded package aliases/includes. |
| `package.json`, `package-lock.json` | transfer and rewrite | Workspace/build dependency authority; change repository identity and reconcile package sets. Regenerate lockfile only through approved deterministic commands. |
| `LICENSE` | transfer | Preserve required license and attribution. |
| `SECURITY.md` | rewrite | Keep only supported reporting, trust, update, and disclosure policy for the standalone repository. |
| `test.sh` | transfer and repair | Preserve no-credential/no-local-model intent; replace movement of the user's real auth file with isolated test configuration. |
| `AGENTS.md`, `OPERATIONS.md`, `Current.md`, `README.md`, `CONTRIBUTING.md` | exclude source copies | Current useful claims are rewritten in this repository; do not import mixed source identity/history. A new public-facing `CONTRIBUTING.md` is required before community launch. |
| `b.sh`, `pi-test.bat`, `pi-test.ps1`, `pi-test.sh` | exclude pending explicit adoption | Personal/compatibility launchers are not verified root contracts. Add cross-platform developer wrappers later only if needed. |
| `tui-plan.md` | exclude | Historical plan, superseded by current TUI implementation audit. |
| machine-created `NUL` or `C:/` artifacts | exclude | Invalid machine-local artifacts. |

## Required scripts

Transfer these because they participate in an active build, check, package, local-install, or release contract. Rewrite identity and package lists before execution in the standalone repository.

| Paths | Contract |
|---|---|
| `scripts/browser-smoke-entry.ts`, `check-browser-smoke.mjs` | Browser-safe bundle check. |
| `scripts/check-pinned-deps.mjs`, `check-ts-relative-imports.mjs` | Dependency and TypeScript import policy. |
| `scripts/generate-coding-agent-shrinkwrap.mjs` | Published coding-agent dependency lock generation/check. |
| `scripts/generate-coding-agent-install-lock.mjs` | Transfer only if the install-lock artifact remains approved after coding-agent release rewrite. |
| `scripts/sync-versions.js` | Workspace version/dependency synchronization; fix nested workspace discovery before authority handoff if necessary. |
| `scripts/build-binaries.sh`, `build-termux-release.sh`, `install-recode-termux`, `recode-termux`, `README.termux.md` | Binary and Termux release path; platform certification still required. |
| `scripts/install-local.mjs`, `local-release.mjs`, `recode/pack-custom-local.mjs` | Local build/install/package path; reconcile telemetry, SQLite, and orchestrator package sets. |
| `scripts/release-identity.mjs`, `release-identity.test.mjs` | Fail-closed source identity; replace source branch/root/product/baseline policy. |
| `scripts/generate-release-manifest.mjs`, `generate-release-manifest.test.mjs` | Release provenance manifests. |
| `scripts/generate-artifact-index.mjs`, `generate-artifact-index.test.mjs`, `verify-release-artifacts.mjs` | Deterministic artifact size/hash inventory and verification. |
| `scripts/release-packages.mjs`, `publish.mjs`, `release.mjs` | Package discovery, publication, and release transaction; disabled until approved identity/repository setup. |
| `scripts/publish-release-announcement.mjs`, `publish-release-announcement.test.mjs` | Transfer only if the announcement endpoint remains part of the approved release design. |
| `scripts/release-notes.mjs` | Transfer after replacing inherited repository defaults and link policy. |
| `scripts/profile-coding-agent-node.mjs`, `profile-maestro-service.mjs`, `profile-startup-artifact.mjs`, `profile-startup-artifact.test.mjs` | Maintained performance qualification tools; outputs are evidence artifacts, not source. |

## Excluded scripts

| Paths | Reason |
|---|---|
| `scripts/cost.ts`, `stats.ts`, `tool-stats.ts`, `session-transcripts.ts` | Personal/session analytics, not required by product build or release. |
| `scripts/edit-tool-stats.mjs`, `read-tool-stats.mjs`, `session-context-stats.mjs` | Machine/user-session analysis with `.pi` defaults; exclude unless explicitly adopted and privacy-reviewed. |
| `scripts/repro-5893-wsl-bash.mjs` | One-off issue reproducer, not a maintained gate. |
| `scripts/update-source-imports-to-ts.sh` | One-time source migration helper; current sources already use the intended extension convention. |
| `scripts/check-lockfile-commit.mjs` | Not wired into current root scripts/workflows; reconsider only if a standalone PR policy needs it. |

## Workflows and GitHub metadata

| Paths | Disposition |
|---|---|
| `.github/workflows/ci.yml` | Transfer only after rewrite; pin actions, remove network-backed generation and write-mode checks from CI, and use deterministic credential-free tests. |
| `.github/workflows/npm-audit.yml` | Transfer after pinning actions and deciding schedule, signature policy, and report ownership. |
| `.github/workflows/build-binaries.yml` | Preserve as disabled reference only until release identity, environments, package/artifact manifests, trusted publishing, recovery policy, repository, and native artifacts are approved. |
| `.github/RELEASE_NOTES.md` | Transfer only as an active release input after content rewrite. |
| Issue and pull-request templates | Create fresh minimal Recode templates after public support/contribution policy is approved; do not copy inherited forms. |
| `APPROVED_CONTRIBUTORS`, contributor approval, issue gate/analysis/labels, PR gate, and close-label workflows | Exclude initially. They encode source-repository governance, labels, permissions, and runner/secrets assumptions. |

## Excluded root directories

- `Analyze/`, `update/`, and old root `docs/`: historical evidence already archived and being dispositioned.
- `.git/`, `.husky/`, `.pi/`, `.agents/`: source Git state or machine/tool-local policy. Add fresh hooks only after standalone policy approval.
- `node_modules/`, build output, package binaries, caches, logs, sessions, databases, and release artifacts.
- `n8n-workspace/`: separate workspace with dependencies; not part of the certified Recode harness.
- `re.pi-packages/`: separately owned browser/package repository material, not part of this source transfer.
- `packages/client`, `protocol`, `server`, `session-backends`, and other non-workspace package trees already excluded by package-boundary classification.
- `repi/` source distribution metadata: do not copy blindly; recreate only the minimum standalone product metadata required by rewritten release identity.

## Public repository additions

These are new standalone files, not source-copy candidates:

- public `CONTRIBUTING.md` with setup, tests, docs, review, generated-file, and contribution-license policy;
- `CODE_OF_CONDUCT.md` with approved enforcement contact and attribution;
- optional `SUPPORT.md` separating bugs, questions, security reports, and feature requests;
- fresh issue/PR templates after governance decisions;
- optional `CODEOWNERS` only when real maintainers and review responsibilities are assigned;
- `NOTICE` or third-party attribution files if the license/native/generated-asset audit requires them.

See the [public repository readiness plan](../plans/PUBLIC-REPOSITORY.md) and [versioning/package-lineage plan](../plans/VERSIONING.md).

## Gates before copy approval

1. Verify every transferred script has a caller or documented operator purpose.
2. Define canonical build and publication package sets.
3. Decide whether install-lock and release-announcement facilities remain supported.
4. Define standalone branch, repository, product, package, and baseline identity.
5. Remove all remote mutations from default/local commands.
6. Verify no secrets, user paths, sessions, databases, generated assets, or private evidence enter the inventory.
7. Compare the final copy list to `git ls-files` at the recorded source commit.
