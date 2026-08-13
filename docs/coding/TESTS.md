# Tests

## After code changes

```text
npm run check
```

`check` validates identity, migration safety, generated locks/docs, maintained examples, imports, and TypeScript. Inspect Git status afterward.

Do not use the root build merely to type-check.

## Focused tests

Coding-agent and other Vitest packages, from the package directory:

```text
node ../../node_modules/vitest/dist/cli.js --run test/example.test.ts
```

Orchestrator tests use Node's runner, from the repository root:

```text
node --test packages/orchestrator/test/example.test.ts
```

Run every test you create or change. Prefer focused regressions before wider suites.

## Wider non-E2E gate

From repository root:

```text
bash ./test.sh
```

Do not run unrestricted `npm test` or `npm run build` unless requested. Separate real regressions from stale fixtures and platform/capability failures; never hide them with broad skips.

## Review

Before completion:

```text
git diff --check
git status --short
```

Review the complete task diff and report unrun gates.
