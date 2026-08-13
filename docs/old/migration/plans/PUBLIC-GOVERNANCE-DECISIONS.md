# Public Governance Decisions

This migration-only file records decisions that must be supplied by the Creator before public community files and automation become final. It contains no placeholder identities or fake contacts.

## Required decisions

| Decision | Current recommendation | Status |
|---|---|---|
| Repository host/URL and default branch | Decide after standalone identity and source certification. | pending |
| License confirmation | Preserve upstream MIT notice for inherited substantial portions; audit Recode additions, vendored assets, generated catalogs, and native artifacts for additional attribution. | pending legal/owner confirmation |
| External contribution license | Start with inbound=outbound MIT and no CLA unless legal/organizational needs justify one; optionally use DCO for provenance. | pending |
| Code of Conduct | Adopt Contributor Covenant in an approved current version with exact attribution. | pending |
| Conduct enforcement contact/team | Use a private role mailbox or host reporting facility, never a personal address invented in docs. | pending |
| Vulnerability reporting | Enable GitHub private vulnerability reporting or approve a dedicated security mailbox before `SECURITY.md` is finalized. | pending |
| Supported versions | During prerelease, support only the latest approved prerelease; define stable backport policy before `latest`. | pending |
| Maintainers/reviewers | Name actual people/teams and package ownership before adding CODEOWNERS. | pending |
| Issue categories | Bug, feature/design, documentation, provider/integration; keep security private. | pending |
| Support channel | GitHub Discussions is preferable if enabled; no response SLA. | pending |
| Moderation | Maintainers enforce conduct consistently; no inherited auto-close/AI triage initially. | pending |
| Roadmap visibility | Publish only approved owned TODOs; migration and speculative future files are not roadmap promises. | pending |
| Telemetry/privacy | Default behavior, endpoint ownership, data fields, opt-out, and retention require explicit review before release. | pending |

## Files blocked by decisions

- canonical `SECURITY.md` reporting channel and supported-version table;
- canonical `CODE_OF_CONDUCT.md` enforcement contact;
- optional `.github/CODEOWNERS`;
- issue forms, discussions routing, labels, and moderation automation;
- DCO/CLA bot or pull-request certification;
- public privacy/telemetry statement.

`CONTRIBUTING.md` and `SUPPORT.md` may exist during migration if they state the current boundary accurately. Do not activate public templates or automation until this table is resolved and the source repository is certified.

## Approval record

When a decision is approved, record the date, exact choice, and owning permanent file. Do not store private contact credentials or security-system recovery information here.
