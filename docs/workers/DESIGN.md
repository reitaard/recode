# Worker Design

## Model

A `WorkerDirectory` owns stable worker definitions and bounded conversations. Each run receives a selected model, role prompt, explicit tools, token limit, workspace, and optional task context.

Definitions use stable IDs; display names and aliases are presentation. Current IDs are `research`, `audit`, and `shiori`.

## Isolation

- Workers run through independent `AgentHarness` calls.
- They receive only declared tools.
- They cannot delegate or write Kioku.
- Web tools are limited to Mayuri.
- Levi receives a read-only Git tool.
- Local files and web results are treated as untrusted data.
- Hidden reasoning and tool transcripts are not returned to the parent.

## Conversations

Conversations preserve bounded dialogue context and expose stable IDs, status, turn count, elapsed time, last tool, and bounded output. They can be cancelled or closed.

Defaults currently cap:

- 64 stored conversations;
- 8 active conversations total;
- 8 active conversations per worker;
- 24,000 history characters per conversation.

## Workspace safety

A worker may use the active workspace or another worktree sharing the same Git common directory. It cannot select an unrelated repository through the worker API.

## Activation

Delegation is enabled by default. `REPI_DELEGATION=0`, `false`, `no`, or `off` disables worker tools.
