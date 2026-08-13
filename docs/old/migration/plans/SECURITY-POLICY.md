# Security Policy Rewrite Plan

The inherited security file is not adopted. A final root `SECURITY.md` must be created before public launch from approved Recode ownership and verified implementation boundaries.

## Required final sections

1. supported release lines and end-of-support rule;
2. approved private reporting channel;
3. information requested in a report;
4. acknowledgement/triage/update expectations without an unstaffed SLA;
5. coordinated disclosure request;
6. scope: CLI, packages, release artifacts, update path, extensions/packages, RPC/gateway/Maestro, credentials, native artifacts, and repository automation;
7. explicit non-security/support routing;
8. secret redaction and safe reproduction guidance;
9. third-party provider/dependency vulnerability routing;
10. safe-harbor language only if legally approved.

## Verified trust boundaries to disclose

- Recode tools and extensions execute with the current user's authority; there is no built-in OS sandbox.
- Project trust gates project settings/resources but cannot make trusted code harmless.
- Skills/prompts are model instructions and packages are supply-chain inputs.
- RPC stdin/stdout has no built-in network authentication or encryption.
- Telegram, providers, package managers, browser tools, Maestro processes, containers, local-model servers, and update services are separate trust boundaries.
- Offline mode is application startup policy, not a firewall.
- Credentials, sessions, memory, telemetry, diagnostics, and release provenance can contain sensitive metadata.
- Native binaries are excluded until provenance/rebuild certification.
- Self-update must fail closed without validated standalone package/release identity.

## Before publishing the policy

- approve the private channel and test that maintainers receive reports;
- decide supported versions and backport policy;
- complete package/release/CI threat review;
- confirm telemetry/privacy behavior and endpoints;
- inventory dependency/native/license reporting routes;
- ensure issue templates redirect security reports without collecting details publicly;
- remove migration wording and link the final policy from README, contributing, support, and package security docs.

Until then, do not place a fake email, personal address, inherited source-project contact, or response promise in canonical docs.
