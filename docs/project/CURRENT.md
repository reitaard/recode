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
- Pre-transfer documentation closure and coding-agent transfer Slices 1–6 are complete.
- Coding-agent source was copied from the audited checkpoint, rewritten to standalone identity, and statically audited. It is not yet installed, built, tested, packed, or certified because dependency packages and root infrastructure remain absent.
- Slice 7 telemetry/AI ledgers and dry runs are frozen; explicit apply approval is the next gate.
- `re.pi` remains provenance/reference history and is not modified by this migration.
- The intended destination is a public open-source repository for worldwide contributors. Public launch still requires fresh Recode governance, security, conduct, support, CI/fork-safety, licensing, and release decisions; inherited repository policy is not adopted automatically.

## Evidence limits

Memory, docs, and session history are each incomplete. Another machine may hold separate memory and sessions. Preserve provenance; absence from one source proves nothing.

## Known documentation limits

- Package/runtime claims describe behavior verified against the audited old-source checkpoint, not executable behavior in this documentation repository.
- Imports, examples, generated schemas, package contents, and platform claims require post-transfer certification.
- Final security/conduct contacts, license decisions, and repository links remain Creator-owned inputs.

Do not claim this repository builds, passes tests, is release-ready, or is authoritative until source migration and certification finish.
