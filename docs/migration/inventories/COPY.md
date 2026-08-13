# Exact Source Copy Manifest

Source: `../re.pi` at `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`.

Machine-readable ledger: [`transfer.tsv`](../manifest/transfer.tsv). Generator: [`build.py`](../manifest/build.py).

The ledger contains one row for every one of the 1,767 Git-tracked paths at the certified source commit. It is an inventory and review boundary, not authorization to copy files.

## Dispositions

| Disposition | Count | Meaning |
|---|---:|---|
| `transfer` | 1,243 | Copy byte-for-byte initially, subject to post-copy verification. |
| `rewrite` | 172 | The path is needed, but inherited content or identity cannot become standalone authority unchanged. Rewrite before certification. |
| `quarantine` | 33 | Preserve only outside active publication/runtime paths until a separate decision or certification admits it. |
| `regenerate` | 1 | Do not copy the source instance; recreate deterministically after approved inputs are present. |
| `exclude` | 318 | Do not copy into the standalone repository. |
| **Total** | **1,767** | Equals `git ls-files` at the certified commit. |

Counts are review aids, not product scope metrics. Most transferred rows are package source and tests.

## Important interpretation rules

- `rewrite` is not permission to overwrite current documentation with inherited prose. Current documentation remains authoritative during migration.
- `quarantine` paths must not be placed where GitHub Actions, npm publication, package files, example discovery, or runtime loading can activate them.
- Generated AI TypeScript catalogs are classified `transfer`, not `regenerate`, because they are checked-in deterministic release inputs. Their future refresh remains generator-owned and network-opt-in.
- Runtime JSON/HTML/CSS/vendor assets and SQLite migration SQL are `transfer`; emitted copies under `dist` would be `regenerate`, but no tracked `dist` rows exist at this commit.
- The single current `regenerate` row is the retained `with-deps` example lockfile. Other external example lockfiles remain quarantined with their whole examples.
- Package changelogs are retained as provenance, but their product identity and release links still require review before publication.
- This ledger does not supersede the semantic decisions in the package, root, workflow, example, and asset inventories.

## Quarantine groups

The 33 quarantined rows comprise:

- binary-release workflow and inherited release notes;
- four TUI native prebuilds;
- coding-agent install-lock facility;
- announcement/release-note facilities pending policy;
- external/platform extension examples: custom providers, Gondolin, sandbox, SSH, interactive shell, macOS theme, notifications, and GitHub issue completion.

Quarantine is deliberately stricter than ordinary transfer. If the Creator later approves one group, update the semantic inventory and generator together, regenerate the ledger, and review the resulting diff.

## Exclusion highlights

The 318 excluded rows include:

- historical analysis/update/root documentation and inherited repository governance;
- separate or local workspaces/configuration;
- non-release package trees;
- superseded Agent documentation;
- the broken unexported coding-agent Harness adapter and test;
- stale documentation screenshots;
- subprocess subagent, Doom/generated Wasm, unsafe Git automation, novelty games, and redundant visual examples;
- old session migration helper and personal/one-off scripts.

## Reproducibility

From the standalone documentation repository:

```text
python docs/migration/manifest/build.py
```

The generator fails if `../re.pi` is not checked out at the certified commit. A valid regeneration must:

1. emit exactly 1,767 data rows;
2. preserve the disposition totals above unless an reviewed policy change intentionally changes them;
3. produce no unexplained ledger diff;
4. leave `../re.pi` unchanged.

The migration-only `manifest/copy_transfer.py` consumes only `transfer` rows, validates the frozen source commit/ledger hash/row count, refuses collisions by default, and has no quarantine mode. It defaults to dry-run and requires `--apply` after approval. `rewrite` paths remain individual destination work; `exclude`, `quarantine`, and `regenerate` rows are never read for copy.

## Freeze status and remaining approval work

The exact current ledger is recorded as a [freeze candidate](../plans/MANIFEST-FREEZE.md). Package, AI, coding-agent, telemetry, and public-governance drafts are complete enough to establish destination ownership, but remain provisional until post-transfer certification.

Before copy approval:

- approve the exact source commit, disposition totals, ledger hash, and quarantine/exclusion choices;
- resolve standalone repository/package/release identity sufficiently to prevent inherited identity becoming active during the first build;
- keep install-lock, announcement, release-note, external examples, and native prebuilds quarantined unless separately admitted;
- review licenses/attribution for vendored and binary inputs;
- review a transfer-only copier and dry run;
- obtain explicit Creator approval for the copy operation.

Final security/conduct contacts, optional-feature admission, package publication, and public remote activation remain later independent approvals.
