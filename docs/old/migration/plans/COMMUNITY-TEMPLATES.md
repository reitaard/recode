# Community Template Plan

Create fresh Recode templates only after source certification and governance approval. Inherited issue workflows/forms remain excluded.

## Bug form

Request component/package, Recode version, installation method, OS/architecture, Node/runtime, terminal when relevant, minimal reproduction, expected/actual behavior, focused logs, and whether the issue reproduces without third-party extensions. Warn against secrets/session data. Require acknowledgement that security reports use the private channel.

## Feature/design form

Request problem/use case, proposed ownership boundary, alternatives, compatibility/security/platform impact, and willingness to contribute. Do not solicit implementation-only requests without a use case.

## Documentation form

Request page/path, incorrect or missing claim, expected correction, and source/export/test evidence when available.

## Provider/integration form

Request provider/API, auth type, credential-free reproduction where possible, region/runtime, whether it is deterministic or live-network behavior, and sanitized provider error metadata. Never request keys.

## Pull-request template

Keep it short:

- focused scope and linked issue/design;
- tests run/unrun;
- public API/compatibility impact;
- security/trust review;
- docs/examples/changelog updated;
- generated files regenerated through owner;
- no secrets/private data;
- contributor has reviewed AI-assisted output and has rights to submit it.

## Initial automation policy

- no AI triage, auto-close, auto-label mutation, external gist/session publishing, or contributor allowlist;
- no secrets or write permissions on fork code;
- no `pull_request_target` execution of untrusted checkout;
- add labels/CODEOWNERS only after real maintainers and categories exist;
- prefer host-native forms and private vulnerability reporting over custom bots.
