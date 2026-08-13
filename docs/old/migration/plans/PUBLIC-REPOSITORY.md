# Public Repository Readiness Plan

Recode is intended for public release and collaboration by developers worldwide. This changes the migration acceptance target from a private, operator-focused source transfer to a discoverable, buildable, reviewable, and governable open-source repository.

This plan does not activate a remote, publish packages, create community automation, or authorize release. It defines what must be true before those actions are proposed.

## Public-release principles

1. A new contributor must understand what Recode is, what is stable, and what remains experimental without reading migration material.
2. A contributor must be able to clone, install dependencies safely, build, run deterministic tests, and locate a subsystem owner from documented commands.
3. Public documentation must preserve useful depth. Consolidate duplicate or stale prose, but do not collapse substantial extension, protocol, session, platform, or architecture contracts into shallow indexes.
4. Supported behavior comes from public exports and reproducible gates. Experimental and uncertified behavior is labeled at the closest relevant location.
5. Security and governance are Recode-owned policies. Inherited Pi/RePi contributor controls, secrets, labels, and moderation automation are not adopted implicitly.
6. Examples are part of the public API experience. Retained examples must compile, use public imports, avoid unsafe defaults, and identify external/network/platform requirements.
7. Automation is least-privilege, pinned, deterministic, and safe for pull requests from forks before it becomes active.
8. Release provenance, licenses, attribution, generated inputs, and native artifacts must be inspectable by external reviewers.

## Required public root surface

| Path | Requirement |
|---|---|
| `README.md` | Clear value proposition, status, feature summary, quick start after publication is real, screenshots only when current, architecture/package links, platform limits, contributing/security/license links. |
| `CONTRIBUTING.md` | New Recode policy: setup, issue/PR expectations, branch/fork workflow, tests, docs, generated files, security routing, review, and DCO/CLA decision. Do not copy inherited gatekeeping policy. |
| `SECURITY.md` | Supported versions, private vulnerability-reporting channel, scope, response expectations, secret-handling guidance, and no-public-zero-day request. Final contact/channel requires Creator approval. |
| `CODE_OF_CONDUCT.md` | Adopt a recognized public code of conduct with correct attribution and an approved enforcement contact before community launch. |
| `LICENSE` | Preserve valid licensing and audit third-party/native/generated attribution. Add `NOTICE` or attribution files if the audit requires them. |
| `SUPPORT.md` | Optional but recommended: questions, bugs, security, feature requests, and unsupported deployment routing without promising response SLAs. |
| `.github/ISSUE_TEMPLATE/` | Fresh minimal bug, feature, documentation, and package/integration forms only after support policy is settled. No inherited contributor approval gates. |
| `.github/PULL_REQUEST_TEMPLATE.md` | Small checklist for scope, tests, docs, security, generated files, and breaking changes. |
| `.github/CODEOWNERS` | Optional; add only when real maintainers and review responsibilities exist. |

Do not publish migration ledgers, private operational history, local paths, archived planning material, or uncertified release instructions as normal project navigation.

## Documentation architecture

### Layer 1 — public entry

Root README and `docs/INDEX.md` answer:

- why Recode exists;
- current maturity and known limitations;
- how to install/run once a release channel is approved;
- how packages fit together;
- where users, integrators, and contributors should go next.

### Layer 2 — contributor guides

Permanent repository docs should include:

- architecture and package ownership;
- local development and deterministic test matrix;
- documentation ownership and compatibility policy;
- security/trust model;
- release/provenance overview;
- supported platform matrix;
- contribution workflow.

Internal migration status must not be required to build or contribute after launch.

### Layer 3 — package owners

Each package README owns purpose, public entry points, minimal examples, compatibility/status, build/test commands, and links to focused detail. Focused package docs retain consequential lifecycle, protocol, storage, extension, security, and platform contracts.

### Layer 4 — generated/API contracts

Large discriminated unions, schemas, CLI tables, environment-variable inventories, and session formats should be generated or drift-tested where practical. Handwritten prose explains semantics and safety rather than duplicating every type.

## Coding-agent reassessment

The previous target of approximately 20 files remains a useful lower bound, not a hard compression goal. For a public developer audience, retain separate focused documents when the subject has an independent compatibility or safety contract.

Recommended final set:

### Start and operate

- `README.md`
- `docs/index.md`
- `docs/getting-started.md`
- `docs/cli.md`
- `docs/configuration.md`
- `docs/providers.md`
- `docs/sessions.md`
- `docs/platforms.md`
- `docs/security.md`

### Extend and integrate

- `docs/customization.md`
- `docs/extensions.md`
- `docs/packages.md`
- `docs/skills.md` when its discovery/validation contract cannot remain clear inside customization
- `docs/themes.md` when schema/discovery and accessibility guidance merit a focused guide
- `docs/sdk.md`
- `docs/rpc.md`
- `docs/json.md` only if distinct from RPC after source review
- `docs/session-format.md`

### Recode subsystems

- `docs/memory.md`
- `docs/workers.md`
- `docs/maestro.md`
- `docs/telegram.md`
- `docs/development.md`

Keybindings and terminal setup may remain focused files if merging them into configuration/platforms would make troubleshooting materially worse. Compaction belongs in sessions unless its verified algorithm/operator controls require an independent contract.

Expected final range: **22–26 focused text documents**, not a forced 20. The objective is lower duplication and correct ownership, not minimum file count.

## Package documentation reassessment

The Agent, TUI, telemetry, SQLite, and orchestrator drafts remain appropriate package owners, but public readiness adds these requirements:

- compile every example against public exports after transfer;
- add stable source links only after the public repository URL exists;
- identify semver/compatibility expectations;
- provide package-local contribution/testing guidance where root commands are insufficient;
- avoid saying a package can be installed until it is actually published;
- give known limitations a visible, non-alarmist home;
- preserve changelog provenance but review inherited identity and unsupported claims;
- inspect package tarball contents before publication.

The AI replacement README now gives external provider authors a maintainable addition checklist without exposing credentials or making network tests default. Post-transfer compilation and deterministic/live-suite separation remain certification gates.

## Examples reassessment

A public repository benefits from more than the smallest possible example set, but quantity must not outrank maintenance.

Retain examples in tiers:

1. **Core, CI-compiled:** minimal SDK, tool, extension lifecycle, resources, session, structured output, policy gate, and representative UI examples.
2. **Integration, opt-in:** providers, notifications, GitHub tooling, SSH, local models, and interactive shell with explicit dependencies/security/platform notes.
3. **Experimental:** sandbox/VM or complex visual demonstrations outside default package/distribution and CI claims until separately certified.

Every retained example needs an owner, purpose, public imports, expected output, cleanup behavior, and a test/compile lane. Unsafe Git automation and the conflicting subprocess subagent system remain excluded unless redesigned.

## CI and fork safety

Before public pull requests are enabled, CI must:

- use pinned actions and least privilege;
- be read-only against the checkout;
- avoid repository/organization secrets on untrusted code;
- avoid network model refresh, credential tests, local-model pulls, publication, and release mutation;
- run deterministic build, typecheck, formatting/lint, focused unit tests, link checks, and example compilation;
- split Linux, Windows, and macOS gates according to actual support claims;
- upload only bounded non-sensitive failure artifacts;
- document required versus optional checks.

Scheduled audits and release workflows must remain separate from pull-request CI. `pull_request_target` must not execute untrusted checkout code.

## Governance preparation status

Migration drafts now exist for:

- root `CONTRIBUTING.md` and `SUPPORT.md`, both explicitly pre-launch;
- [governance decisions](PUBLIC-GOVERNANCE-DECISIONS.md);
- [security policy rewrite](SECURITY-POLICY.md);
- [Code of Conduct adoption](CODE-OF-CONDUCT.md);
- [community templates](COMMUNITY-TEMPLATES.md).

Canonical `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR forms, and CODEOWNERS remain blocked on approved contacts, policy choices, maintainers, and repository identity.

## Governance decisions required before launch

Creator approval is required for:

- public repository URL and default branch;
- license confirmation and external contribution license policy;
- Code of Conduct enforcement contact;
- vulnerability-reporting channel;
- issue categories, support expectations, and moderation policy;
- maintainer/reviewer roles and CODEOWNERS, if any;
- DCO, CLA, or neither;
- release authority, signing/provenance, npm organization, package scope, and the clean version lineage defined in the [versioning plan](VERSIONING.md);
- telemetry/privacy statement and data collection defaults;
- roadmap visibility and how experimental work is proposed.

Until decided, use placeholders only in migration plans—not fake contacts or promises in canonical public files.

## Public-launch gates

1. Source transfer manifest is frozen and approved.
2. Root and package identity are standalone Recode identity.
3. Public README, contribution, security, conduct, support, architecture, development, and platform documents are complete.
4. Retained package and coding-agent docs pass link, symbol, stale-identity, and example checks.
5. Deterministic fork-safe CI passes on all claimed baseline platforms.
6. Default tests require no credentials, model downloads, remote mutation, or personal configuration.
7. Native and binary artifacts have provenance, licenses, hashes, and target smoke tests—or are omitted.
8. Package contents and source archives contain no private/migration/local material.
9. Dependency, vendored asset, and license/attribution review is complete.
10. Known defects and experimental boundaries are published accurately.
11. Security and governance contacts/policies are approved.
12. Creator separately approves remote creation, initial push, package publication, and release activation.
