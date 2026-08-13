# Evidence

Use this guide when rebuilding Recode's current documentation from older records.

## Evidence sources

Recode's history may be spread across:

1. Current source code and tests
2. Git commits, tags, branches, and diffs
3. Runtime and release artifacts
4. Session history
5. Documentation and audit evidence
6. Project Kioku memory from this machine
7. Project Kioku memory from other machines
8. Creator recollection and current clarification

No single source is complete.

## Trust order

For implementation claims, prefer:

1. Reproducible behavior in current source and tests
2. Exact commit or artifact evidence
3. Session records showing the work and verification
4. Current focused documentation
5. Historical documents
6. Kioku memory

The Creator decides intent and authority. Code can prove what exists, but not whether an unfinished or hidden behavior is still wanted.

## Preservation rules

- Never overwrite one machine's memory with another machine's memory.
- Copy memory sets into separately labeled evidence locations before comparing them.
- Preserve original timestamps, paths, machine labels, and session identifiers.
- Do not deduplicate records merely because their wording is similar.
- Record contradictions instead of silently choosing one account.
- Do not import old memory wholesale into the new repository's active `.pi/memory`.
- Admit only concise, verified facts into the new active project memory.
- Do not delete old documents, memories, or sessions until their useful information is accounted for and the Creator approves.

## Suggested intake layout

When the other machine is available, use an external or ignored evidence area such as:

```text
migration-evidence/
  current-machine/
    memory/
    sessions/
  laptop/
    memory/
    sessions/
  reports/
```

Do not commit private session transcripts or machine-local memory by default. The committed `docs/old/` directory is for selected repository documentation and non-sensitive evidence only.

## Reconciliation result

Every important historical claim should eventually become one of:

- **current** — verified and documented in current docs;
- **planned** — wanted but not implemented;
- **old** — once true but superseded;
- **rejected** — deliberately not part of Recode;
- **unknown** — evidence conflicts or verification is still needed.
