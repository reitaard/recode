# Memory and Shiori

## Parts

- **Kioku:** Markdown memory plus SQLite search index
- **Shiori:** private knowledge worker and manual memory reviewer
- **Cardinal:** deterministic validation, duplicate check, and admission
- **Teach Mode:** stages proposals for Creator approval

## Scope

Project memory belongs to the launch working directory. Global access and global automatic recall are separate controls. Project trust is required for project memory tools.

Automatic recall is bounded and inserted as hidden evidence before a turn. It may be stale, contradictory, or incomplete.

## Commands

```text
/memory
/memory status
/memory search <query>
/memory reindex
/memory auto on|off
/memory global on|off
/memory global-auto on|off
/shiori
/shiori review
/shiori review all
/shiori review <path>
/teach on|status|review|save [id]|off
```

## Admission

Direct approved writes and approved Teach/Shiori proposals pass through Cardinal. Cardinal:

1. checks scope access;
2. normalizes the candidate;
3. searches for duplicates;
4. writes Markdown through the memory manager;
5. reconciles the index.

While Teach Mode is active, direct Kioku writes and Shiori review are blocked so staged approval cannot be bypassed.

## Safety

- Search never authorizes a write.
- Workers receive read-only recall only.
- Shiori does not claim a memory was saved unless Cardinal admitted it.
- Files on Shiori's Desk are not indexed until reviewed and approved.
- Never import another machine's memory wholesale; preserve provenance and reconcile entries individually.
