# Current State

Checked: 2026-08-13 against old source commit `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`.

## Verified

- CLI: `recode`; current migration-source package identity: `@reitaard/repi-coding-agent`. Standalone packages will use `@reitaard/recode-*` on one synchronized fixed train. The approved standalone bootstrap version is `0.1.0` and must not use deprecated `0.84.0-beta.1`.
- Aizen Runtime uses `AgentHarness`; its core runtime and profile have focused tests. Mode-by-mode certification remains to be recorded.
- Workers: Mayuri (`research`), Levi (`audit`), and Shiori (`shiori`).
- Kioku stores Markdown and indexes it in SQLite; project recall is default, global access is separate.
- Maestro lives in `packages/orchestrator` and supervises durable full sessions.
- Pi is an integration source, not Recode's product identity.

## New repository

- The local repository has documentation checkpoint commits. Remote/publication state must be verified separately rather than inferred from this status page.
- Documentation migration is approaching pre-transfer closure.
- Product source is not copied or certified here.
- `re.pi` remains the source reference until explicit transfer.
- The intended destination is a public open-source repository for worldwide contributors. Public launch still requires fresh Recode governance, security, conduct, support, CI/fork-safety, licensing, and release decisions; inherited repository policy is not adopted automatically.

## Evidence limits

Memory, docs, and session history are each incomplete. Another machine may hold separate memory and sessions. Preserve provenance; absence from one source proves nothing.

## Known documentation limits

- Package/runtime claims describe behavior verified against the audited old-source checkpoint, not executable behavior in this documentation repository.
- Imports, examples, generated schemas, package contents, and platform claims require post-transfer certification.
- Final security/conduct contacts, license decisions, and repository links remain Creator-owned inputs.

Do not claim this repository builds, passes tests, is release-ready, or is authoritative until source migration and certification finish.
