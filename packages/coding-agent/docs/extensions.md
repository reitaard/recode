# Extensions

Extensions are executable TypeScript/JavaScript modules loaded into the coding-agent process. Import public types and factories from the package root; do not import `src/` paths.

```ts
import type { ExtensionAPI } from "@reitaard/recode-coding-agent";

export default function extension(api: ExtensionAPI) {
  api.registerCommand("hello", {
    description: "Show a greeting",
    handler: async (_args, ctx) => ctx.ui.notify("hello", "info"),
  });
}
```

The default factory may be async; startup waits for it. Registration includes tools, commands, shortcuts, flags, providers, message/entry renderers, and event handlers. Source metadata identifies the owning file/package.

## Lifecycle and events

Exported event types cover project trust, session start/switch/fork/tree/compact/shutdown, agent and turn lifecycle, context transformation, input, tool calls/results, user bash, and provider request/response hooks. Handlers can alter sensitive behavior; ordering and cancellation semantics must be taken from exported types and runner tests.

Tool-call interception can deny or transform calls. Provider hooks can change headers and payloads. Context hooks can change model-visible history. These are policy boundaries, not harmless callbacks.

## UI availability

Interactive contexts can select, confirm, input, edit, notify, set status/widgets/title/editor text, or install custom renderers. RPC can represent a bounded subset as `extension_ui_request` records and requires matching responses. Print/JSON/headless callers may not provide interactive UI; extensions must handle unavailable operations and cancellation.

## Sessions and Aizen

The extension/SDK host is a retained AgentSession compatibility surface integrated with Aizen. Exported session switch/fork context actions do not imply equivalent Aizen CLI tools. Persist private extension state with custom entries; use custom messages only when content should enter model context.

## Loading and trust

User, trusted project, package, and explicit CLI sources are supported. Explicit CLI extensions participate in project-trust bootstrap and are therefore already trusted by the caller. Reload clears loader caches and repeats registration. Extensions must release timers, processes, listeners, and external resources during shutdown.

## Author checklist

- use public imports and declare runtime dependencies;
- keep module initialization bounded and fail with actionable diagnostics;
- namespace commands, flags, status keys, widgets, and custom entry types;
- validate all external input and paths;
- support abort signals and idempotent cleanup;
- avoid logging credentials/session contents;
- document network, subprocess, platform, and permission requirements;
- compile/test the packed artifact, not only source through workspace aliases.

A complete generated event/API table and example certification remain post-transfer gates; inherited long-form prose is not copied as authority.
