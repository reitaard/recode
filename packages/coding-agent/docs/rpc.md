# RPC Protocol

Start the compatibility runtime with:

```text
recode --mode rpc
```

The planned `./rpc-entry` target is an executable side-effect bootstrap intended to be spawned by integrations such as `RpcClient`. Importing it starts RPC initialization; it does not export a callable library API. Ordinary shell integrations should use the CLI command above. Its package availability remains pending transferred-manifest and packed-content verification.

Commands arrive on stdin; responses, session events, and extension UI requests leave stdout. Every record is one JSON object terminated by LF (`\n`). Do not use readers that split on additional Unicode separators inside JSON strings. Keep logs off protocol stdout.

## Correlation

A command can include `id`; its response repeats it. Responses have `type: "response"`, the command name, `success`, and either `data` or `error`. Prompt acceptance is not completion: observe lifecycle/session events.

## Command groups

- prompt/queue: `prompt`, `steer`, `follow_up`, `abort`, `new_session`;
- state/model/thinking: `get_state`, model list/set/cycle, thinking set/cycle;
- delivery/recovery: steering/follow-up modes, compaction, retry;
- execution: `bash`, `abort_bash`;
- sessions: stats, export, switch, fork, clone, entries/tree/messages/name;
- integrations: external events and Maestro completion handoff;
- discovery: `get_commands`.

The exported `RpcCommand` and `RpcResponse` discriminated unions are protocol authority. Unsupported/invalid records return failures; clients must tolerate asynchronous events between responses.

## Extension UI

`extension_ui_request` supports select, confirm, input, editor, notify, status, widget, title, and editor-text operations. Interactive requests carry an ID and may time out. Reply with one matching `extension_ui_response` value, confirmation, or cancellation. Notifications/state setters do not necessarily require user input.

## Security

RPC exposes model prompts, shell execution, session mutation, file-derived tools, and extension UI. Run it only across an authenticated, access-controlled transport. The CLI itself does not authenticate stdin/stdout, encrypt records, or sandbox operations. Never expose a raw RPC process directly to a network.

A generated schema/drift test is required after transfer; this concise guide does not duplicate every union field.
