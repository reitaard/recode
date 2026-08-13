# Update

Recode and upstream Pi are separate authorities.

> **Pre-transfer status:** this repository has no executable product update path. The behavior below was verified against the audited source checkpoint and must be rechecked after transfer and `@reitaard/recode-*` identity rewriting.

## Current behavior

- Extension/package updates remain separate from core source updates.
- Built-in self-update is disabled until validated Recode-owned release metadata exists.
- Foreign package identity must fail closed.
- Linked/source checkouts require a clean, non-destructive source-update strategy.

## Upstream integration

1. Verify branch, HEAD, remotes, ancestry, and working tree.
2. Fetch refs without changing files or clobbering tags.
3. Compare exact old-upstream, current-Recode, and new-upstream revisions.
4. Produce a three-way plan for conflicts and protected Recode behavior.
5. Integrate in an isolated branch/worktree.
6. Reconcile dependencies and generated locks deliberately.
7. Run focused tests and full repository validation.
8. Merge, build, install, or release only with separate approval.

## Never

- run raw upstream installation as a Recode update;
- reset, clean, stash, or discard dirty work;
- merge upstream directly without a reviewed three-way plan;
- treat an upstream tag as Recode release authority;
- infer installed state from source state.

Record current update status in focused docs, not a permanent chronological source of truth.
