# Contributing to Recode

Thank you for helping improve Recode. The repository is currently in a controlled migration phase: product source has not yet been transferred or certified here. Documentation, migration-plan, and review contributions can be discussed, but normal code contribution commands and public issue workflows become authoritative only after the standalone source and CI are present.

## Before proposing work

- Search existing issues and documentation once the public tracker is active.
- For a substantial feature, public API change, package addition, protocol change, or release-system change, discuss the design before implementation.
- Never place active secrets or unpatched exploit details in a public issue. A private vulnerability-reporting channel and canonical `SECURITY.md` are not active yet; public contribution intake must not open until that route is approved and tested.
- Do not treat `docs/old/` or `docs/migration/` as current product authority.

## Repository orientation

Start with:

1. `README.md` for product status;
2. `AGENTS.md` for repository authority and safety rules;
3. `docs/INDEX.md` for the smallest relevant guide;
4. the owning package README and public exports for package behavior.

Current source, exported APIs, reproducible tests, and approved repository policy outrank prose. Preserve provenance and unrelated changes.

## Development setup

The permanent standalone setup begins only after approved source transfer. At that point, follow `docs/setup/BUILD.md` and use the documented Node engine floor. The first build is a from-scratch bootstrap; do not copy dependencies, `dist/`, binaries, generated declarations/maps, caches, tarballs, or release output from another checkout.

Do not run installation, publication, deployment, release, remote mutation, network catalog generation, credential-backed suites, local-model downloads, or native-binary replacement merely because a script exists.

## Make a focused change

- Keep each pull request narrow enough to review and revert.
- Add or update tests for behavior changes.
- Update the owning documentation when public behavior changes.
- Use public package imports in examples; never import another package's private `src/` files.
- Do not mix generated output with handwritten edits. Change the owner/generator and regenerate through the documented command.
- Keep network, credential, local-model, native, and platform tests explicitly separated from deterministic default gates.
- Do not silently remove compatibility behavior; document migration and versioning impact.
- Never commit credentials, tokens, private session/memory data, machine-local paths, dependency directories, or personal diagnostics.

## Tests and checks

After source transfer, begin with the smallest relevant regression and then use `docs/coding/TESTS.md`. Default pull-request gates must remain credential-free, deterministic, read-only with respect to remote systems, and safe for forks.

Before requesting review:

```text
git diff --check
git status --short
```

Inspect the complete diff. Report tests that were not run and why. A passing compile is not release, platform, native-artifact, or package-content certification.

## Documentation

Package READMEs own public entry points and minimal examples. Focused package docs own lifecycle, protocol, persistence, extension, security, and platform contracts. Root docs route rather than duplicate.

When changing a command, setting, environment variable, event, schema, session format, export, or example, add a drift test or generated reference where practical. Use Recode product language; retain `.pi`, `PI_*`, and `pi.*` names only for verified compatibility paths, schemas, or identifiers.

## Commits and pull requests

Use clear commit messages that describe the change, not the tool used to create it. AI-assisted contributions are welcome, but contributors remain responsible for understanding, testing, licensing, and reviewing every submitted line. Do not include generated conversational transcripts or make bulk unrelated formatting changes.

A pull request should explain:

- the problem and chosen scope;
- behavior and compatibility impact;
- security/trust implications;
- tests and platforms exercised;
- documentation/generated files changed;
- remaining limitations or follow-up work.

Maintainers may ask for a change to be split, narrowed, or moved to its owning package.

## Licensing and conduct

The repository license, inbound contribution-license policy, DCO/CLA decision, and Code of Conduct enforcement channel require project-owner approval before public contribution intake. Do not submit external contributions until those terms are published; this draft creates no contribution-license agreement.

No contributor or maintainer should promise support, merge timelines, releases, compatibility, or platform certification without approved evidence.
