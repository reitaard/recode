# Agent Telemetry Schema Regeneration Plan

The Agent package exports typed AI-request and Harness telemetry schema objects. Its Markdown reference must be generated from those objects after source transfer; inherited generated Markdown is not copied as authority.

This plan does not copy or generate product output before the owning source exists in this repository.

## Owning inputs

After transfer:

- `packages/agent/src/harness/telemetry.ts` owns `AI_TELEMETRY_SCHEMA`, `HARNESS_TELEMETRY_SCHEMA`, typed attributes, and span starters;
- `packages/agent/scripts/generate-telemetry-docs.ts` owns deterministic Markdown rendering;
- `packages/agent/docs/telemetry-schema.md` is generated reference output;
- `packages/agent/test/harness/telemetry.test.ts` owns serialization, exact span inventory, type constraints, parent composition, and checked-in drift verification;
- standalone `@reitaard/recode-telemetry` owns generic schema/type machinery, not the Agent domain vocabulary; the source checkpoint still uses the predecessor package identity.

The emitted `pi.ai.*`, `pi.harness.*`, and `pi.session.*` names are compatibility schema identifiers. They remain until a separately versioned schema migration is approved; they are not product branding in prose.

## Required package scripts

The transferred Agent manifest currently lacks the generator scripts described by its old design prose. Add explicit deterministic commands during the package-manifest rewrite:

```json
{
  "scripts": {
    "generate:telemetry-docs": "<run packages/agent/scripts/generate-telemetry-docs.ts>",
    "check:telemetry-docs": "<same runner> --check"
  }
}
```

Choose the TypeScript runner only after the standalone root toolchain is transferred. Do not invent a command that depends on an undeclared global executable.

`check:telemetry-docs` must be part of the deterministic repository check. Generation reads local typed schema objects and writes only the expected Markdown file; it performs no network access.

## First post-transfer regeneration

1. Transfer the typed schema, generator, focused test, telemetry dependency, and build configuration from the approved checkpoint.
2. Rewrite package identity/version ranges without renaming schema identifiers.
3. Update the generated document title from inherited product wording to a neutral Recode/Agent title in the generator itself.
4. Add the two package scripts and root check wiring.
5. Run generation once from a clean tree.
6. Inspect the entire Markdown diff and verify that only schema-derived content changed.
7. Run `check:telemetry-docs` and the focused telemetry test.
8. Run Agent typecheck/build and telemetry conformance tests.
9. Confirm the packed package exports schema objects but does not unintentionally include migration files; decide deliberately whether generated Markdown belongs in the package tarball.

Never hand-edit the generated table to conceal a schema mismatch. Change the typed schema or renderer, regenerate, and review.

## Generator corrections

The inherited renderer currently emits `# Pi Agent Telemetry Schemas`. During transfer, change this generator-owned title to standalone Recode/Agent wording while preserving actual schema names. Keep the generated warning and include the exact generating/check command once the runner is approved.

Rendering must remain deterministic:

- preserve schema declaration order;
- escape table delimiters and newlines;
- render requiredness, literal/element values, cardinality, and sensitivity;
- render parent constraints and status behavior;
- emit an explicit no-events row/message;
- end with one newline;
- avoid timestamps, absolute paths, versions unrelated to schema version, and environment-dependent output.

## Drift and compatibility gates

Certification requires:

- generated file exactly equals renderer output;
- both schema objects JSON-serialize;
- exact expected span inventory is tested;
- unknown/missing attributes fail at compile time where the typed API promises this;
- parent span composition passes the generic telemetry conformance contract;
- schema version changes are intentional and receive changelog/migration review;
- public docs do not claim active product-wide emission merely because schemas exist;
- no free-form sensitive values are added without cardinality/redaction review.

## Transfer-manifest disposition

Source-path decisions remain:

- generator source, typed schemas, and tests: `transfer`;
- inherited `docs/telemetry-schema.md`: `rewrite`, so an automated copier must not copy it;
- the regenerated standalone file: created only from transferred source during the first clean build/certification phase.

This is the sole `regenerate`-style documentation exception even though the source-path ledger calls the inherited destination `rewrite`: the distinction prevents importing stale generated prose while retaining a deterministic destination path.
