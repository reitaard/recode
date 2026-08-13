# Development Rules

## Repository Operations

- Read `OPERATIONS.md` before update, release, packaging, installation, worker, memory, orchestrator, or remote-deployment work.
- For update and release work, follow the reading order under `update/README.md` and keep its context, decisions, plan, and log current.

## Conversational Style

- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text (e.g., "Thanks @user" not "Thanks so much @user!")
- Technical prose only, be direct
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or disagree before saying what you changed.

## Code Quality

- Read files in full before wide-ranging changes, before editing files you have not fully inspected, and when asked to investigate or audit. Do not rely on search snippets for broad changes.
- No `any` unless absolutely necessary.
- Inline single-line helpers that have only one call site.
- Check node_modules for external API types; don't guess.
- **No inline imports** (`await import()`, `import("pkg").Type`, dynamic type imports). Top-level imports only.
- Never remove or downgrade code to fix type errors from outdated deps; upgrade the dep instead.
- Use only erasable TypeScript syntax (Node strip-only mode) in code checked by the root config (`packages/*/src`, `packages/*/test`, `packages/coding-agent/examples`): no parameter properties, `enum`, `namespace`/`module`, `import =`, `export =`, or other constructs needing JS emit. Use explicit fields with constructor assignments.
- Always ask before removing functionality or code that appears intentional.
- Do not preserve backward compatibility unless the user asks for it.
- Never hardcode key checks (e.g. `matchesKey(keyData, "ctrl+x")`). Add defaults to `DEFAULT_EDITOR_KEYBINDINGS` or `DEFAULT_APP_KEYBINDINGS` so they stay configurable.
- Never modify `packages/ai/src/models.generated.ts` directly; update `packages/ai/scripts/generate-models.ts` instead, then regenerate. Including the resulting `models.generated.ts` diff is always OK, even if regeneration includes unrelated upstream model metadata changes.

## Commands

- After code changes (not docs), run `npm run check` with full output and fix every error, warning, and info. It does not run tests.
- Never run `npm run build` or the unrestricted `npm test` unless requested.
- Run non-e2e tests through `./test.sh` from the repo root. For a focused test, run `node ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts` from its package.
- If you create or modify a test, run it and iterate until it passes.
- For `packages/coding-agent/test/suite/`, use `test/suite/harness.ts` + the faux provider. No real provider APIs, keys, or paid tokens.
- Put issue-specific regressions under `packages/coding-agent/test/suite/regressions/` named `<issue-number>-<short-slug>.test.ts`.
- Put ad-hoc scripts in a temporary file, run them, then remove them. Do not embed multiline scripts in shell commands.
- Never commit unless the user asks.

## Dependency and Install Security

- Treat npm dep and lockfile changes as reviewed code. Direct external deps stay pinned to exact versions.
- Hydrate/update locally with `npm install --ignore-scripts`; clean/CI-style with `npm ci --ignore-scripts`. Don't run lifecycle scripts unless the user asks.
- If dep metadata changes, refresh `package-lock.json` with `npm install --package-lock-only --ignore-scripts`.
- If `packages/coding-agent/npm-shrinkwrap.json` needs regen, run `node scripts/generate-coding-agent-shrinkwrap.mjs` (verify with `--check` or `npm run check`). New deps with lifecycle scripts require review and an explicit allowlist entry in that script; never add one silently.
- Pre-commit blocks lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1`. Don't bypass unless the user wants the lockfile change committed.

## Git

Multiple Recode sessions may run simultaneously. Preserve changes outside your task.

### Committing

- Commit only files changed for the current task.
- Stage explicit paths; never use `git add -A` or `git add .`.
- Check `git status` before committing.
- Generated `packages/ai/src/models.generated.ts` may accompany its generator change.
- Use `{feat,fix,docs}[(ai,tui,agent,coding-agent)]: <message>`.

### Prohibited Operations

Never run these (destroys other agents' work or bypasses checks):

| Operation | Risk |
|-----------|------|
| `git reset --hard`, `git checkout .` | Loses all uncommitted changes |
| `git clean -fd` | Removes untracked files |
| `git stash` | Hides other sessions' work |
| `git add -A`, `git add .` | Stages unintended files |
| `git commit --no-verify` | Skips validation |
| Force push | Overwrites remote history |

If rebase conflicts occur:

- Resolve conflicts only in files you modified.
- If a conflict is in a file you did not modify, abort and ask the user.
- Never force push.

## Issues and PRs

See `CONTRIBUTING.md` for the contributor gate (auto-close workflows, `lgtm`/`lgtmi`, quality bar).

When reviewing PRs:

- Do not run `gh pr checkout`, `git switch`, or otherwise move the worktree to the PR branch unless the user explicitly asks.
- Use `gh pr view`, `gh pr diff`, `gh api`, and local `git show`/`git diff` against fetched refs to inspect PR metadata, commits, and patches without changing branches.
- If you need PR file contents, fetch/read them into temporary files or use `git show <ref>:<path>` without switching branches.

When creating issues:

- Add `pkg:*` labels for affected packages (`pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:tui`); use all that apply.

When posting issue/PR comments:

- Write the comment to a temp file and post with `gh issue/pr comment --body-file` (never multi-line markdown via `--body`).
- Keep comments concise, technical, in the user's tone.
- End every AI-posted comment with the AI-generated disclaimer line specified by the originating prompt (e.g. `This comment is AI-generated by `/wr``).

When closing issues via commit:

- Include `fixes #<number>` or `closes #<number>` in the message so merging auto-closes the issue. For multiple issues, repeat the keyword per issue (`closes #1, closes #2`); a shared keyword (`closes #1, #2`) only closes the first.

## Testing Recode Interactive Mode with tmux

Run the TUI in a controlled terminal:

```bash
tmux new-session -d -s pi-test -x 80 -y 24
tmux send-keys -t pi-test "./pi-test.sh" Enter
sleep 3 && tmux capture-pane -t pi-test -p     # capture after startup
tmux send-keys -t pi-test "your prompt here" Enter
tmux send-keys -t pi-test Escape               # special keys (also C-o for ctrl+o)
tmux kill-session -t pi-test
```

## Changelog

Location: `packages/*/CHANGELOG.md` (one per package).

Sections under `## [Unreleased]`: `### Breaking Changes` (API changes requiring migration), `### Added`, `### Changed`, `### Fixed`, `### Removed`.

Rules:

- All new entries go under `## [Unreleased]`. Read the full section first and append to existing subsections; never duplicate them.
- Released version sections (e.g. `## [0.12.2]`) are immutable; never modify them.

Attribution:

- Internal (from issues): `Fixed foo bar ([#123](https://github.com/earendil-works/pi-mono/issues/123))`
- External contributions: `Added feature X ([#456](https://github.com/earendil-works/pi-mono/pull/456) by [@username](https://github.com/username))`

## Releasing

**Lockstep versioning**: all packages share one version; every release updates all together. `patch` = fixes + additions, `minor` = breaking changes. No major releases.

1. **Update CHANGELOGs**: ask whether `/cl` was run on the latest authoritative `agent-harness` commit. If not, run it before releasing.

2. **Local smoke test**: build an unpublished release and test it outside the repo so workspace packages cannot mask missing dependencies:

   ```bash
   npm run release:local -- --out /tmp/recode-local-release --force
   cd /tmp

   # Node package tests
   /tmp/recode-local-release/node/recode --help
   /tmp/recode-local-release/node/recode --version
   /tmp/recode-local-release/node/recode --list-models
   /tmp/recode-local-release/node/recode -p "Say exactly: ok"

   # Bun binary tests
   /tmp/recode-local-release/bun/recode --help
   /tmp/recode-local-release/bun/recode --version
   /tmp/recode-local-release/bun/recode --list-models
   /tmp/recode-local-release/bun/recode -p "Say exactly: ok"
   ```
   Verify both Node and Bun startup, model/account listing, interactive startup, and at least one real prompt with the intended default provider. The bare commands `/tmp/recode-local-release/node/recode` and `/tmp/recode-local-release/bun/recode` start interactive mode; run each in tmux, submit a prompt, and wait for the model reply before considering the interactive smoke test passed. Failures are release blockers unless the user explicitly accepts the risk.

3. **Run the release script**:

   ```bash
   PI_ALLOW_LOCKFILE_CHANGE=1 npm_config_min_release_age=0 npm run release:patch  # fixes + additions
   PI_ALLOW_LOCKFILE_CHANGE=1 npm_config_min_release_age=0 npm run release:minor  # breaking changes
   ```

   Use `npm_config_min_release_age=0` only for the release command. The repo's normal npm age gate can otherwise block the release lockfile refresh when the current workspace package version was published recently. Review any lockfile or shrinkwrap diffs the release creates before push.

   The release script verifies `agent-harness`, bumps all package versions, updates changelogs, regenerates release artifacts, runs `npm run check`, commits `Release vX.Y.Z`, tags `vX.Y.Z`, verifies the tag/source/package binding, adds fresh `## [Unreleased]` changelog sections, commits `Add [Unreleased] section for next cycle`, then pushes `agent-harness` and the tag. Do not rerun the release script after a tag was pushed.

4. **Npm publication is currently blocked**: `.github/workflows/build-binaries.yml` currently builds and publishes approval-gated GitHub release assets but has no `publish-npm` job. Do not run a release until a reviewed npm trusted-publishing job and idempotent publish helper are restored. Never substitute local `npm publish`, `npm whoami`, OTP, or WebAuthn publication.

5. **After trusted publishing is restored**: inspect and rerun only the failed tag workflow when npm publication fails. The publish helper must skip package versions already present on npm. Do not rerun `npm run release:patch` or `npm run release:minor` for the same version.

## User Override

If a user instruction conflicts with these rules, ask for explicit confirmation before overriding it.
