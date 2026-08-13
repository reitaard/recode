# Current State

Checked: 2026-08-13 against old source commit `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`.

## Verified

- CLI: `recode`. Transferred coding-agent identity is `@reitaard/recode-coding-agent@0.1.0`; all seven standalone packages use the synchronized `@reitaard/recode-*` `0.1.0` train. Deprecated `0.84.0-beta.1` is forbidden.
- Aizen Runtime uses `AgentHarness`; its core runtime and profile have focused tests. Mode-by-mode certification remains to be recorded.
- Workers: Mayuri (`research`), Levi (`audit`), and Shiori (`shiori`).
- Kioku stores Markdown and indexes it in SQLite; project recall is default, global access is separate.
- Maestro lives in `packages/orchestrator` and supervises durable full sessions.
- Pi is an integration source, not Recode's product identity.

## New repository

- The repository is on branch `main` with configured remote `https://github.com/reitaard/recode.git`; nothing in this status page claims commits were pushed.
- Pre-transfer documentation closure and transfer Slices 1–7 are complete.
- All seven package sources were copied from the audited checkpoint, rewritten to standalone `@reitaard/recode-*` `0.1.0` identities, and statically audited. They are not yet installed, built, tested, packed, or certified because root infrastructure is absent.
- TUI's four uncertified native prebuilds remain quarantined and absent; JavaScript fallback is the current package boundary.
- Orchestrator completion restart recovery remains a visible known defect; SQLite remains optional and non-default.
- The seven-package root workspace, TypeScript identity, deterministic build order, and pre-install safety checks are present. `npm install --ignore-scripts` completed and generated the first standalone lockfile (306 packages added; lifecycle scripts disabled).
- The first complete dependency-order build now passes for all seven packages. The AI Smithy mismatch was resolved by aligning `@smithy/types` to `4.16.1`; the Codex compressed fetch body is copied into an `ArrayBuffer` before submission.
- `undici` was updated from `8.5.0` to `8.10.0`; `npm audit --omit=dev` reports zero vulnerabilities.
- Coding-agent shrinkwrap generation/check and Agent telemetry documentation generation/drift-check are now active and passing.
- Package test progress: telemetry passes 15/15; TUI passes; Agent core passes 468 tests plus 2 skipped; AI passes 895 tests with 713 explicitly skipped. Coding-agent now passes 2,051 tests with 35 failures and 52 skips after identity, nested-settings, example, and recursive-TUI fixes.
- Four inherited coding-agent suites are explicitly excluded in `packages/coding-agent/test/EXCLUDED.md`: one requires the manifest-excluded unsafe Git example, and three require the separately excluded client package. These are package-boundary exclusions, not waived failures in transferred code.
- Remaining coding-agent failures cover Windows capability assumptions, harness/model-runtime fixture drift, Radius explicit-endpoint behavior, and genuine session/compaction/runtime regressions. Focused classification/repair remains active; full certification has not passed.
- The plan now has 18 slices. Slice 18 is the GitHub repository/push/tag/release execution slice, including checksummed artifacts and provenance. Every remote mutation still requires explicit approval at execution time; npm publication remains separately disabled.
- `re.pi` remains provenance/reference history and is not modified by this migration.
- The intended destination is a public open-source repository for worldwide contributors. Public launch still requires fresh Recode governance, security, conduct, support, CI/fork-safety, licensing, and release decisions; inherited repository policy is not adopted automatically.

## Evidence limits

Memory, docs, and session history are each incomplete. Another machine may hold separate memory and sessions. Preserve provenance; absence from one source proves nothing.

## Known documentation limits

- Package/runtime claims describe behavior verified against the audited old-source checkpoint, not executable behavior in this documentation repository.
- Imports, examples, generated schemas, package contents, and platform claims require post-transfer certification.
- Final security/conduct contacts, license decisions, and repository links remain Creator-owned inputs.

Do not claim this repository builds, passes tests, is release-ready, or is authoritative until source migration and certification finish.
