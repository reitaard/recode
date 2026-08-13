# Sessions

Coding-agent's compatibility session store uses append-only JSONL with a header and tree-linked entries. Default storage is beneath the compatibility agent directory, grouped by encoded working directory; `--session-dir` overrides it and `--no-session` is ephemeral.

## Selection

- `--continue`: latest applicable session;
- `--resume`: interactive selection;
- `--session <path|partial-id|name>`: resolve an existing session;
- `--session-id <id>`: exact project ID, creating when missing;
- `--fork <path|partial-id>`: copy an existing session into a new file;
- `--name`: append display metadata.

Session IDs accept alphanumeric characters plus `.`, `_`, and `-`, and must start/end alphanumerically.

## Trees and context

Entries have `id` and `parentId`; the active leaf selects one root-to-leaf branch. Tree navigation preserves other branches. Model and thinking changes are entries, not mutable header fields. Plain custom entries persist extension state but are not sent to the model; custom-message, branch-summary, and compaction entries may enter context.

Compaction is lossy for model context but does not delete the underlying JSONL history. The latest applicable compaction plus its retained tail forms context. Manual and automatic compaction can be customized through extension hooks.

## Runtime boundary

Aizen adapts AgentHarness storage to the compatibility session representation. The exported `SessionManager` and AgentSession switch/fork APIs remain compatibility surfaces; their existence does not restore removed Aizen CLI tools or guarantee identical lifecycle behavior.

Treat session files as sensitive: they may contain source, prompts, tool output, credentials accidentally printed by tools, and provider metadata. See the versioned [session format](session-format.md).
