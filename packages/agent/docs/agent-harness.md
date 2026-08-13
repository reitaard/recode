# AgentHarness

`AgentHarness` is the active durable agent runtime exported from `@reitaard/recode-agent-core`. Coding-agent, Aizen, named workers, and Shiori currently use this V3 boundary.

## Construction

Construct it directly with:

- a `Models` registry;
- a `Session` backed by a compatible storage implementation;
- the initial model;
- optional execution environment, system prompt, tool context/tools, active tools, resources, stream/retry settings, iteration cap, thinking level, and queue modes.

Configuration validates duplicate tool/resource names and rejects unknown active tools. `systemPrompt` and `toolContext` may be resolved dynamically per turn. Turn preparation rebuilds session context and takes fresh resources, model, tool, and stream state.

There is no supported static `AgentHarness.create()` method. The unintegrated coding-agent server adapter that calls it is excluded unless repaired and explicitly adopted.

## Runs and persistence

`prompt()`, `sendMessage()`, `retry()`, `skill()`, and `promptFromTemplate()` start foreground work. Only one foreground operation or compaction/tree operation may own the harness at a time.

The harness persists session entries around operation boundaries and flushes pending writes before preparing another turn. Its journal records inspectable operation, turn, tool, compaction, and tree outcomes. `getJournalEntries()` exposes those records; `recover()` performs the current journal recovery contract.

Provider or hook failure is normalized into `AgentHarnessError`. A failed/aborted run persists a synthetic assistant failure message with the correct stop reason before settlement when the runtime can do so.

Session storage—not the harness object—owns durable format and resource cleanup.

## Event and hook order

`subscribe(listener)` receives harness-owned events plus forwarded low-level agent events. Listeners are awaited and can fail the current operation as hook errors.

Typed hooks run in registration order. Where a hook returns a patch, later handlers observe the accumulated result and the final defined result is applied. Current hook points include:

- before agent start;
- context transformation;
- before provider request and raw payload;
- after provider response;
- tool call and tool result;
- before/after compaction;
- before/after tree navigation.

Provider-request patches can alter transport, timeout/retry/cache options, headers, and metadata. Header/metadata patches merge by key; `undefined` removes a key or the entire map according to patch shape.

Tool-call hooks run after argument validation and may block execution. Tool-result hooks can patch content/details/error state and termination behavior before final result events persist.

## Queues

The harness maintains three distinct inputs:

- **steering** — consumed between model turns according to `one-at-a-time` or `all` mode;
- **follow-up** — consumed after normal completion according to its queue mode;
- **next turn** — deferred to the next turn boundary.

`steer*`, `followUp*`, and `nextTurn*` enqueue messages. Queue updates are observable. `clearQueuedMessages()` returns removed steering and follow-up messages. Failed queue-drain hooks restore messages rather than silently losing them.

## Mutation APIs

Model, thinking level, active tools, resources, queue modes, and stream options have explicit get/set APIs. Durable state changes append corresponding session entries. Tool replacement revalidates names and active selection.

Avoid mutating package-private collections or session storage behind an active run.

## Cancellation and settlement

`abort()` is asynchronous and returns an `AbortResult`. It aborts the current run or operation and waits for its settlement path; repeated or idle aborts follow the typed result contract. `abortCompaction()` targets compaction. `waitForIdle()` waits for foreground and operation promises.

Abort is cooperative across provider streams, tools, hooks, compaction, and storage boundaries. Hosts must still ensure their tool/environment implementations honor `AbortSignal` and bounded cleanup.

The harness phase is one of `idle`, `turn`, `compaction`, `branch_summary`, or `retry`.

## Compaction and tree navigation

`compact()` prepares context, runs summary generation with retry callbacks, allows before/after hooks, and appends compaction state. `navigateTree()` prepares a target branch, may generate a branch summary, and changes the active leaf through session storage.

Compaction and branch-summary errors retain their typed causes and are normalized at the harness boundary. Aborting summary work is not equivalent to corrupting or deleting the session.

## Errors

`AgentHarnessError` codes distinguish invalid arguments, busy state, abort, session, provider, tool, hook, compaction, branch summary, and unknown failures. Related `SessionError`, `CompactionError`, `BranchSummaryError`, `ExecutionError`, and `FileError` types preserve narrower subsystem causes.

Do not branch only on error text when a typed code is available.

## Telemetry

The root exports generic telemetry contracts plus Agent-owned schemas and typed span starters. The schema document is generated from source types. Existence of schemas does not prove active emission on every runtime path; call-site verification is required before claiming complete tracing.

## Verification

After transfer:

```sh
npm run test:harness -w @reitaard/recode-agent-core
npm run build -w @reitaard/recode-agent-core
```

The audited upstream checkpoint at `fbd6b5b3` passed the focused active-harness gate. Storage adapters need their own conformance/platform gates.
