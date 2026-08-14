# Documentation Contract

This file governs Recode documentation updates.

## Canonical ownership

| Information | Canonical home |
|---|---|
| Product identity and cross-package architecture | `docs/project/` |
| Repository policy and documentation process | `AGENTS.md`, `docs/coding/` |
| Public package API and examples | owning package `README.md` |
| Core lifecycle and implementation contracts | focused docs beside the owning package |
| CLI behavior and customization | `packages/coding-agent/docs/` |
| Approved unfinished work | owning topic's `TODO.md` |
| Historical evidence | Git history and release provenance |

One fact has one canonical explanation. Other files link to it and add only local context.

## Admission gate

Canonical documentation may contain a claim only after the reviewer:

1. identifies the owning package and public boundary;
2. reads the implementation and focused tests;
3. checks manifests, exports, scripts, and generated-copy boundaries;
4. runs the smallest relevant test for consequential behavior;
5. confirms the claim describes current behavior or Creator-approved work;
6. updates affected indexes and links.

Creator-approved policy defines product intent. Verified current source, public exports, and reproducible tests outrank prose. Maintainer/reviewer authority follows repository governance.

Claims that are superseded, rejected, inherited, contradictory, or unverified do not enter canonical docs. Git history and release provenance preserve historical evidence.

## Public contributor standard

Documentation must allow an external developer without migration history or private context to understand, build, test, extend, and review the supported repository. Consolidation removes stale identity and duplication; it must not erase substantial extension, SDK, protocol, session, storage, platform, security, or architecture contracts. Public examples are compatibility assets and receive the same ownership and verification discipline as API prose.

Do not publish fake support contacts, availability, platform claims, response promises, or release commands while those decisions remain unapproved.

## Detail placement

Top-level docs provide routing, policy, and stable cross-package boundaries. Detailed contracts stay beside their owning code, including:

- lifecycle, ordering, persistence, and recovery invariants;
- public types, events, hooks, protocols, and extension APIs;
- concurrency, cancellation, authentication, and safety boundaries;
- compatibility, serialization, build, and release contracts;
- focused test matrices required to prove those contracts.

Promote a detail to top-level docs only when it is required to select the correct owner or prevent a cross-package design violation.

## Change synchronization

Review documentation whenever code changes:

- package exports or CLI commands;
- runtime/session lifecycle or event ordering;
- storage/session formats;
- tools, extensions, workers, memory, or Maestro contracts;
- configuration, environment variables, security boundaries, or install paths;
- build, release, update, recovery, or platform support.

Update the owning detailed document in the same change. Update top-level routing only when ownership or a cross-package boundary changes.

## Noise controls

- Do not create a file when a canonical owner already exists.
- Do not copy package READMEs or implementation detail into top-level docs.
- Do not document unsupported internal paths as architecture.
- Do not edit `dist/`, `binaries/`, generated catalogues, copied assets, or vendored docs.
- Do not put audit notes, chronology, rejected ideas, or speculative designs in canonical docs.
- Do not add timestamps to stable design documents.
- Do not keep an obsolete claim with a warning; remove it from canonical docs.
- Keep approved unfinished work separate from current behavior.

## Completion

A documentation change is complete when every claim passes the admission gate, ownership is unambiguous, core detail remains reachable, synchronized files are updated, links pass, and no obsolete duplicate remains in canonical routing.
