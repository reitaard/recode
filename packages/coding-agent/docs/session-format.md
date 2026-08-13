# Session JSONL Format

`SessionManager` currently writes format version `3`. One JSON object occupies each LF-delimited line. The first record is a session header; later records form a tree through `id` and `parentId`.

## Header

```json
{"type":"session","version":3,"id":"...","timestamp":"...","cwd":"...","parentSession":"..."}
```

`parentSession` is optional. Version 1 lacked a version and tree IDs; migration adds them. Version 3 renames the old `hookMessage` message role to `custom`.

## Entry kinds

| Type | Purpose / context behavior |
|---|---|
| `message` | Agent message; participates in context. |
| `thinking_level_change` | Selects thinking state. |
| `model_change` | Selects provider/model state. |
| `active_tools_change` | Records active tool names. |
| `compaction` | Summary plus token count and optional retained-tail metadata; participates in compacted context. |
| `branch_summary` | Summary from another branch; participates in context. |
| `custom` | Extension state; excluded from model context. |
| `custom_message` | Extension content; participates in context, optionally displayed. |
| `label` | Bookmark metadata for a target entry. |
| `session_info` | Display metadata such as name. |
| `leaf` | Explicit selected leaf target. |

Unknown/malformed handwritten data is not a supported editing interface. Parsing skips malformed lines and migrations mutate loaded records; consumers requiring strict validation must add it at their boundary.

## Compatibility

Use exported `SessionManager`, `SessionEntry`, `FileEntry`, migration, tree, and context helpers rather than reimplementing traversal. Preserve unknown generic `details` data when transforming files. Do not assume file order alone is the active conversation; follow the selected leaf's parent chain and compaction rules.

This document must gain a drift check against the exported discriminated union after source transfer.
