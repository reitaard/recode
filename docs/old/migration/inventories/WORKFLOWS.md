# Workflow Inputs and Automation Inventory

Source: `../re.pi` at `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`.

No workflow was executed. This is a static certification of triggers, permissions, actions, scripts, secrets, environments, generated artifacts, and remote mutations.

## Decision summary

| Workflow | Disposition |
|---|---|
| `.github/workflows/ci.yml` | Transfer only after rewrite. Preserve install/build/check/test intent, pin actions by full commit, use the supported Node floor/matrix deliberately, and run a deterministic credential-free test command. |
| `.github/workflows/npm-audit.yml` | Transfer only after policy rewrite. Pin actions, select the supported Node version deliberately, define schedule/report ownership, and decide whether registry-signature failure is a blocking gate. |
| `.github/workflows/build-binaries.yml` | Transfer as disabled reference until release identity, package sets, artifacts, trusted publishing, environments, native provenance, and repository permissions are approved. Do not enable by copying it into an active workflow path. |
| Contributor approval, issue analysis/gates/labels, PR gate, and close-label workflows | Exclude initially. They encode inherited repository governance, labels, permissions, organization secrets, environment names, gist publication, and remote mutation. |

## CI findings

The inherited CI runs on pushes and pull requests targeting `main`, on Ubuntu only. It installs system graphics dependencies plus `fd` and `ripgrep`, then runs:

1. `npm ci --ignore-scripts`;
2. `npm run build`;
3. `npm run check`;
4. `npm test`.

Required corrections:

- `actions/checkout@v4` and `actions/setup-node@v4` are mutable major tags; pin exact reviewed commits.
- `node-version: 22` floats across Node 22 while the repository requires `>=22.19.0`; select an exact supported certification version or explicit matrix.
- `npm run build` invokes AI's network-backed model generation. CI must use deterministic `build:release`-style compilation or a renamed deterministic build, with catalog refresh in a separate opt-in workflow.
- `npm run check` contains `biome check --write`; CI validation must not mutate the checkout. Split formatting repair from a read-only check.
- `npm test` does not enforce the credential/local-model isolation attempted by `test.sh`. Replace `test.sh`'s mutation of the user's real auth file with an isolated environment, then use that deterministic gate in CI.
- Ubuntu-only CI does not certify Windows terminal behavior, Darwin modifiers, native prebuilds, binaries, or Termux.
- `npm ci --ignore-scripts` deliberately skips lifecycle scripts; document which native/generated setup is expected to be unnecessary for CI and test that assumption.

## Dependency audit findings

The inherited audit runs daily and manually with read-only contents permission. It installs with lifecycle scripts disabled, runs a production vulnerability audit at moderate severity, then verifies registry signatures.

Before adoption:

- pin both actions by commit;
- use an exact supported Node version;
- establish an owner and response process for scheduled failures;
- verify `npm audit signatures --omit=dev` behavior for workspaces, local workspace packages, and the approved lockfile;
- keep it read-only and separate from publication.

## Binary and publication workflow

### Triggers and mutation boundary

The workflow runs for `v*` tag pushes and manual dispatch. Its build job is read-only and uploads an intermediate Actions artifact. Subsequent jobs can:

- publish npm packages through OIDC trusted publishing on tag pushes;
- create, delete, edit, and publish GitHub Releases;
- upload release assets.

Manual dispatch does not publish npm packages, but it can still stage and publish a GitHub Release after the `release-preview` environment approval. Treat any activation as remote-release authorization, not as a harmless build check.

### Inputs that must transfer together if adopted

- pinned checkout, Bun, Node, upload-artifact, and download-artifact actions;
- `scripts/release-identity.mjs` and its tests;
- binary, Termux, release-manifest, install-lock, artifact-index, artifact-verification, publication, and release-note scripts;
- `.github/RELEASE_NOTES.md` only after current content rewrite;
- package manifests, lockfile, checked-in generated catalogs, runtime assets, certified native helpers, docs/examples selected for binary distribution, and applicable licenses;
- Git tag/history access (`fetch-depth: 0`), repository release permissions, npm trusted-publishing configuration, and the approved environment.

### Blocking defects or unresolved policy

- Source identity still assumes the inherited repository/root/branch/baseline and must be rewritten.
- Node versions differ across CI (`22`) and release (`26.4.0`), while package policy states `>=22.19.0`; define the support and release matrix.
- The workflow packages all coding-agent `docs` and `examples`, including material currently classified for rewrite or exclusion. Replace broad directory copies with an approved distribution manifest.
- The binary build copies uncertified TUI `.node` prebuilds and downloaded clipboard native packages. Record provenance, hashes, licenses, target architecture, and smoke tests.
- `npm pack` downloads cross-platform native packages during the build. Pinning the dependency version is not enough by itself; preserve lock/provenance evidence and verify fetched tarballs.
- Build tooling downloads dependencies and compiles cross-target binaries on one Ubuntu runner; Windows runtime and architecture behavior remain uncertified without target smoke tests.
- Generated source archive uses `git archive` over the entire tag. The standalone repository must first contain only approved public material; release packaging is not a substitute for transfer filtering.
- Draft staging deletes an existing draft with the same tag before recreating it. Keep this destructive mutation behind explicit release authorization and define rerun/recovery policy.
- A single preview approval precedes draft creation and automatic publication. Decide whether final staged assets require a distinct approval before making the release public.
- npm publication and GitHub publication are independent branches after the build; partial success can leave one public channel released and the other failed. Define reconciliation and rollback rules.
- Release cleanup deletes only draft GitHub releases; npm publication is irreversible and no transactional rollback exists.
- The announcement and other release scripts remain separately conditional per the root inventory.

## Excluded governance automation

Do not transfer inherited governance workflows merely because they are tracked:

- contributor approval can push repository changes;
- issue analysis consumes organization/repository secrets, writes issues, updates secrets, and publishes a gist/share URL;
- issue and PR gates depend on inherited contributor lists, labels, authorization, and moderation policy;
- label cleanup mutates issue state.

Adoption would require a fresh threat model, least-privilege permissions, fork/untrusted-input review, secret-boundary review, organization ownership, label schema, audit logging, and Creator approval.

## Public-fork threat boundary

Public collaboration makes pull-request safety a release blocker. Default CI must execute untrusted fork code without repository or organization secrets, write permissions, publication credentials, persistent self-hosted runner state, or remote mutation. Never use `pull_request_target` to check out and execute an untrusted contribution. Keep model/provider credentials, catalog refresh, release signing, npm publication, GitHub Release mutation, and deployment in separately authorized workflows.

Required public checks should report actionable failures without uploading source secrets, personal configuration, session data, or unbounded logs. Platform jobs must correspond to documented support rather than implying certification from a single Ubuntu build.

## Exact pre-activation gates

1. Rewrite standalone identity, default branch, repository URLs, environment names, package sets, and support policy.
2. Pin every third-party action to a reviewed commit and record update ownership.
3. Make checks read-only and builds deterministic by default.
4. Separate no-network certification from opt-in model refresh and platform release builds.
5. Replace broad docs/examples copies with an approved file manifest.
6. Certify native and downloaded binary inputs, including licenses and hashes.
7. Test artifacts on each claimed target rather than only building them on Ubuntu.
8. Prove package tarball contents with `npm pack --dry-run` or equivalent inspection.
9. Define npm/GitHub partial-failure, rerun, draft-deletion, rollback, and final-approval policy.
10. Keep publication workflows outside active trigger paths until the Creator explicitly approves activation.
11. Prove forked pull requests receive no secrets or write token and cannot reach privileged follow-up jobs through artifact, cache, workflow-command, or label paths.
12. Add only fresh issue/PR automation that matches the approved public governance policy; keep AI triage and remote mutation out initially.

## Evidence checked

- All tracked `.github` files and workflow trigger/permission/action/script references.
- Root scripts and workspace package sets from `package.json`.
- CI, npm audit, binary/Termux build, release identity, artifact, publication, and credential-free test paths.
- Source repository remained unchanged at the recorded commit and branch.
