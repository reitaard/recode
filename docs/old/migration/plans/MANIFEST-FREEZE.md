# Transfer Manifest Freeze Candidate

This records the reviewed whole-source ledger state. It is a freeze **candidate**, not copy approval. Execution is now split into package/root phases by the [coding-agent-first staged transfer plan](STAGED-TRANSFER.md); the full-ledger copier must not be used as one bulk transfer.

## Source and ledger

- source repository: `../re.pi`
- audited source commit: `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`
- generator: `docs/migration/manifest/build.py`
- ledger: `docs/migration/manifest/transfer.tsv`
- rows: 1,767 unique tracked source paths
- ledger SHA-256: `f208a4b67fba6174abc462ff72e8e3accd10335065babb1c1ebbc12cb98aab5b`

| Disposition | Count |
|---|---:|
| transfer | 1,243 |
| rewrite | 172 |
| quarantine | 33 |
| regenerate | 1 |
| exclude | 318 |

Regeneration at the audited source commit produces no diff. Any source commit, classifier, count, path, reason, or hash change invalidates this candidate and requires semantic-inventory review.

## Important rewrite interpretation

The 172 source `rewrite` rows are destination requirements, not one-for-one file-copy requirements. The inherited coding-agent `docs/docs.json` is explicitly excluded because no documentation-site build has been adopted.

In particular, inherited coding-agent documentation is consolidated into the current 24-document owner set. Source docs such as `quickstart.md`, `usage.md`, `settings.md`, `environment-variables.md`, `compaction.md`, platform fragments, and other merged topics must **not** be copied merely because their source row says `rewrite`. Their useful claims have destination owners in `packages/coding-agent/README.md` and `packages/coding-agent/docs/`.

Likewise, inherited Agent telemetry Markdown is regenerated from transferred typed source according to the Agent telemetry plan, not copied.

A copier therefore consumes only `transfer`. `rewrite` paths are handled by an explicit destination map or already-created files. Missing one-to-one destination paths are expected when consolidation is documented.

## Frozen quarantine choices

Keep outside active workflows, package files, runtime discovery, and normal examples:

- binary release workflow and inherited release notes;
- four uncertified TUI native prebuilds;
- coding-agent install-lock and its generator;
- release announcement/note helpers;
- custom-provider, Gondolin, sandbox, SSH, interactive-shell, notification, macOS-theme, and GitHub-issue examples.

No quarantine group is admitted before transfer. Later admission requires Creator approval, its own certification, generator change, regenerated hash, and review.

## Frozen exclusion choices

The exclusions listed in the copy, archive, package, example, root, workflow, and asset inventories remain excluded. High-risk exclusions include:

- historical/private/local repository material;
- removed/non-workspace packages;
- superseded Agent designs;
- broken coding-agent `server/create-harness` adapter and test;
- inherited coding-agent screenshots and subprocess subagent system;
- novelty/generated/unsafe examples;
- personal statistics/reproduction scripts;
- old session migration helper;
- inherited governance automation;
- generated build/package/binary output.

## Decisions that do not block source-path freeze

These remain destination/post-transfer decisions because no quarantined source is activated by freezing:

- the selected names are `@reitaard/recode-*`; the selected bootstrap version is `0.1.0`;
- SQLite is approved for the initial seven-package `0.1.0` train; publication wiring, registry availability, certification, and actual publication remain pending;
- canonical security/conduct contacts;
- native-prebuild certification or omission;
- install-lock/release-announcement adoption;
- external-example certification;
- public remote/release activation.

They do block transfer execution or final public certification where stated in their owning plans.

## Whole-ledger evidence and phased approval

The earlier whole-ledger dry run established 1,243 transfer files, 13,928,511 bytes, five reviewed/identical existing-file skips, zero collisions, and zero missing source files. That result is freeze evidence only and is **not** a prerequisite or authorization for one bulk copy.

Executable approval is phase-specific. For coding-agent, use the [coding-agent transfer gate](CODING-AGENT-TRANSFER-GATE.md) and its scoped evidence: 615 files, 8,759,888 bytes, zero skips, zero collisions, and zero missing files. Confirm both repositories are clean, source HEAD still matches, and the decision checkpoint exists before requesting explicit apply approval.

No approval is implied by this document.
