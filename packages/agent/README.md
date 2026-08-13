# `@reitaard/recode-agent-core`

Composable agent execution and session primitives used by Recode. The package contains two runtime layers plus an isolated Session V4 library:

- `Agent` — low-level stateful model/tool loop;
- `AgentHarness` — active durable runtime used by coding-agent, Aizen, workers, and Shiori;
- Session V4 — separately exported storage/reducer library that is **not** the active coding-agent harness runtime.

Node `>=22.19.0` is required. Source and manifest are present under the standalone `0.1.0` identity; installation, build, tests, telemetry-document regeneration, packing, and publication remain uncertified until root infrastructure is transferred.

## Export map

| Import | Purpose |
|---|---|
| `@reitaard/recode-agent-core` | Agent, active AgentHarness, sessions, tools, compaction, telemetry, and shared types |
| `@reitaard/recode-agent-core/node` | Root exports plus Node `ExecutionEnv` implementation |
| `@reitaard/recode-agent-core/session-v4` | Isolated Session V4 library |
| `@reitaard/recode-agent-core/session-v4/testing` | Session V4 conformance/testing utilities |
| `@reitaard/recode-agent-core/package.json` | Package metadata |

## Low-level Agent

`Agent` owns an in-memory transcript, streams lifecycle events, executes tools, and supports steering and follow-up queues.

```ts
import { Agent } from "@reitaard/recode-agent-core";
import { createModels } from "@reitaard/recode-ai";
import { anthropicProvider } from "@reitaard/recode-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());
const model = models.getModel("anthropic", "<catalog-model-id>");
if (!model) throw new Error("Model is absent from the reviewed catalog");

const agent = new Agent({
  initialState: {
    systemPrompt: "Answer concisely.",
    model,
  },
});

const unsubscribe = agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await agent.prompt("Hello");
unsubscribe();
```

A run emits agent, turn, message, and tool lifecycle events. In parallel tool mode, completion events follow actual completion order while durable tool-result messages remain in assistant source order. `beforeToolCall` can block validated calls; `afterToolCall` can patch results or request termination. Abort cancels active work; `waitForIdle()` includes awaited final subscribers.

Use `convertToLlm` when custom `AgentMessage` variants need filtering or projection into model messages. `transformContext` runs before that conversion.

## Active AgentHarness

`AgentHarness` binds the agent loop to durable session storage, model lookup, resources, tools, environment capabilities, compaction, tree navigation, queues, hooks, and a recovery journal.

```ts
import { createModels } from "@reitaard/recode-ai";
import { anthropicProvider } from "@reitaard/recode-ai/providers/anthropic";
import {
  AgentHarness,
  InMemorySessionStorage,
  Session,
} from "@reitaard/recode-agent-core";
import { NodeExecutionEnv } from "@reitaard/recode-agent-core/node";

const models = createModels();
models.setProvider(anthropicProvider());
const model = models.getModel("anthropic", "<catalog-model-id>");
if (!model) throw new Error("Model is absent from the reviewed catalog");

const harness = new AgentHarness({
  models,
  env: new NodeExecutionEnv({ cwd: process.cwd() }),
  session: new Session(new InMemorySessionStorage()),
  model,
  systemPrompt: "You are helpful.",
});

const answer = await harness.prompt("Hello");
await harness.waitForIdle();
```

Construct the harness directly. There is no current static `AgentHarness.create()` API.

See [AgentHarness](docs/agent-harness.md) for lifecycle, persistence, hooks, queues, cancellation, compaction, and errors.

## Sessions and storage

The active harness exports in-memory and JSONL repositories/storage plus generic `SessionRepo` and `SessionStorage` contracts. The Node subpath supplies filesystem/shell capabilities. The optional SQLite implementation is owned by `@reitaard/recode-storage-sqlite-node`; it is not coding-agent's default backend.

Opened sessions own storage resources. Hosts and adapters are responsible for invoking the storage cleanup lifecycle when provided.

## Tools and resources

Harness tools extend the low-level tool contract with a host-supplied context. Tool names and active-tool names must be unique; unknown active names fail at configuration time. Resources contain skills and prompt templates and can be replaced between turns.

The root also exports shell/file helpers, prompt/skill formatting, context projection, compaction, branch summaries, typed telemetry schemas, and generic telemetry re-exports. Provider/model internals belong to `@reitaard/recode-ai`.

## Session V4 isolation

Session V4 is available only through its explicit subpaths. It models lanes, entries, append-only operation records, reducers, context projection, memory/JSONL repositories, and conformance utilities. Coding-agent does not currently instantiate it as AgentHarness storage.

See [Session V4](docs/session-v4.md). Do not mix V4 entry/record types with the active V3 session contracts from the root entry point.

## Build and test

After source transfer:

```sh
npm run build -w @reitaard/recode-agent-core
npm test -w @reitaard/recode-agent-core
npm run test:harness -w @reitaard/recode-agent-core
```

At the audited upstream checkpoint `fbd6b5b3`, active AgentHarness focused tests passed 19 cases and Session V4/storage/telemetry focused tests passed 258 cases. Re-run all declared gates after transfer.
