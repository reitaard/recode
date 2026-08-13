# Contributing to Recode

Thank you for helping improve Recode.

## Before proposing work

- Search existing issues and documentation.
- Discuss substantial features, public API changes, package additions, protocol changes, or release-system changes before implementation.
- Report vulnerabilities through the private route in [SECURITY.md](SECURITY.md), never a public issue.
- Treat `docs/old/` as historical evidence, not current product authority.

## Development

Use Node.js `>=22.19.0`, then:

```sh
npm ci --ignore-scripts
npm run check
npm run build
npm test
```

Start with the smallest relevant regression. Default gates must remain credential-free, deterministic, read-only against remote systems, and safe for forks. Network providers, model downloads, native builds, and external services require separate opt-in testing.

## Changes and pull requests

- Keep changes focused and preserve unrelated work.
- Add or update tests for behavior changes.
- Update owning documentation when public behavior changes.
- Use public package imports in examples.
- Change generators rather than hand-editing generated output.
- Never commit credentials, private sessions or memory, machine-local paths, diagnostics, dependencies, build output, or release artifacts.

A pull request should explain its scope, compatibility and security impact, tests and platforms exercised, documentation or generated files changed, and remaining limitations.

Before requesting review:

```sh
git diff --check
git status --short
```

## Licensing and conduct

Contributions are accepted under the repository's MIT license. Recode currently requires neither a CLA nor DCO sign-off. Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). The initial maintainer is `@reitaard`; no response, merge, support, or release SLA is promised.
