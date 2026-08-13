# Coding-Agent Transfer Gate

This is the scoped approval boundary for transferring coding-agent implementation first. It does not authorize copying.

## Frozen scope

- source: `../re.pi@fbd6b5b3a494d6c50bc5415eb3be2e4366470056`
- whole ledger: `manifest/transfer.tsv` SHA-256 `f208a4b67fba6174abc462ff72e8e3accd10335065babb1c1ebbc12cb98aab5b`
- derived review ledger: `manifest/coding-agent.tsv`
- derived-ledger review SHA-256: `3882aaf9fbf9f2d295dbc2d31c601be91d86feaac31c449ef964ca8c31966bd2`
- prefix: `packages/coding-agent/`

| Disposition | Rows |
|---|---:|
| transfer | 615 |
| rewrite | 119 |
| quarantine | 23 |
| regenerate | 1 |
| exclude | 36 |
| total | 794 |

The 119 rewrite rows are handled by the current package README/docs, later identity edits, and reviewed retained-example rewrites. They are not copied automatically. Existing documentation is never overwritten.

## Destination/documentation ownership

- `README.md` and package docs are owned by the 24-document replacement set recorded in the coding-agent documentation plan.
- Inherited docs that were merged into another owner have no one-to-one destination requirement.
- `docs/docs.json`, stale images, broken `server/create-harness`, subprocess subagent, unsafe/redundant examples, and old migration helper remain excluded.
- install-lock and external/platform examples remain quarantined.
- the retained example lockfile remains regenerate-only.

## Identity boundary

The copied source still contains predecessor `@reitaard/repi-*` identity until the immediately following rewrite slice. It must not be installed, built, packed, published, or treated as authoritative between raw copy and identity neutralization.

Standalone identity is `@reitaard/recode-coding-agent` with dependencies under the selected `@reitaard/recode-*` map. The standalone bootstrap version is fixed at `0.1.0` for identity rewrite. Deprecated `0.84.0-beta.1` is forbidden.

## Copier evidence

Command:

```text
python docs/migration/manifest/copy_transfer.py --phase coding-agent
```

Verified dry-run result:

- 615 transfer files;
- 8,759,888 source bytes;
- zero existing-file skips;
- zero collisions;
- zero missing source files;
- source repository clean at the certified commit.

The copier requires `--phase` for `--apply`; bulk apply is forbidden. It validates the whole-ledger hash, source commit, derived phase prefix/count, source cleanliness, path containment, and destination collisions. It does not currently consume or hash-check `coding-agent.tsv`; that file/hash is review evidence reproducibly derived from the enforced whole ledger. It does not process non-transfer dispositions.

## Remaining approval inputs

Before apply:

1. Creator-approved bootstrap version `0.1.0` is recorded.
2. Creator-approved initial publication graph includes all seven `@reitaard/recode-*` packages at `0.1.0`, including SQLite.
3. Re-run phase-ledger generation and dry run with clean repositories.
4. Commit the decision checkpoint.
5. Creator explicitly approves `--apply --phase coding-agent`.

After copy, verify bytes/path set, then checkpoint raw provenance before the identity rewrite. No install or build occurs until dependencies/root bootstrap are ready and separately approved.
