# Coding Rules

## Scope

- Read affected files fully before broad edits.
- Preserve unrelated and concurrent changes.
- Ask before removing intentional behavior.
- Prefer the smallest complete fix; do not add speculative layers.
- Keep Recode identity; Pi is an integration source.

## TypeScript

- Avoid `any`; check dependency types instead of guessing.
- Use top-level imports; no dynamic or inline type imports.
- Use erasable TypeScript syntax in checked source/tests.
- Do not edit generated model catalogues directly.
- Do not downgrade behavior to satisfy stale types or tests.

## Dependencies

- Treat dependency and lock changes as reviewed code.
- External direct dependencies stay exact-pinned.
- Use `npm install --ignore-scripts`; do not enable lifecycle scripts silently.
- Refresh lock metadata only through the repository scripts.

## Git

- Check status before and after mutating commands.
- Never reset hard, clean, stash, broad-checkout, rebase-guess, or force-push.
- Stage explicit task files only; never `git add .` or `git add -A`.
- Never commit, tag, push, publish, or access remotes without approval.
- Do not resolve conflicts in files outside the task.

## Docs

Follow [Documentation Contract](DOCS.md). In particular:

- Current facts have one focused home.
- Plans and current behavior must not share an unlabeled section.
- Keep core contracts beside their owning package; top-level docs route them.
- Archive old evidence without rewriting it.
