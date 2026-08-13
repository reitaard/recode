# Named Worker Harness Checkpoint

Status: optional live worker harness on `agent-harness`.

## Goal

Expose reusable named workers through `AgentHarness` without first migrating all
of `AgentSession`, print, RPC, and the TUI:

```text
Any Aizen / authorized caller
  -> shared WorkerDirectory
     -> delegate (one-shot)
     -> worker_start / worker_message (conversation)
  -> isolated named child AgentHarness turn
  -> typed bounded result
```

The larger main-agent migration remains separate and is recorded in
`docs/AGENT_ORCHESTRATION_PLAN.md`.

## Workers

Stable ids are used for routing; display names are case-insensitive aliases.

- `research` -> **Mayuri**
  - real loaded `librarian` skill
  - curious, citation-driven web research personality
  - tools: `web_search`, `fetch_content`, `get_search_content`
  - local project inspection remains Aizen's responsibility
  - thinking requested off
  - completion budget: 16384 tokens
- `audit` -> **Levi**
  - blunt, disciplined audit personality
  - tools: `read`, `grep`, `find`, `ls`
  - thinking requested off
  - completion budget: 16384 tokens

The larger completion budget prevents local reasoning models from consuming a
small 2048-token allowance in reasoning/tool work before producing final text.
Parent-visible output remains bounded separately before it enters shared context.

The schemas inject both canonical ids and display-name aliases into every model
request. Returned results always report the stable canonical id.

Mayuri resolves the package-owned skill named `librarian` from coding-agent's
existing `ResourceLoader`, reads its file, and invokes it through
`AgentHarness.skill()`. If the skill is not loaded, Mayuri returns a typed failure.

## Activation

Delegation is disabled by default. Enable it before starting RePi:

### Git Bash / Linux

```bash
export REPI_DELEGATION=1
repi
```

### PowerShell

```powershell
$env:REPI_DELEGATION = "1"
repi
```

The worker tools are registered centrally in `createAgentSessionFromServices()`.
One `WorkerDirectory` is shared by sessions created from the same runtime services.

## Available tools

- `delegate`: one-shot worker call
- `worker_list`: worker identity/capability/personality directory
- `worker_start`: start an addressable worker conversation
- `worker_message`: talk to that worker again using its conversation id
- `worker_status`: process/run status and bounded last result
- `worker_cancel`: cancel an active turn
- `worker_close`: close and forget a conversation

Independent one-shot or conversation calls are parallel-safe. LM Studio or another
provider may queue requests according to its own concurrency setting.

## Runtime rules

- An explicit request to use a worker overrides the simple-task optimization.
- If an explicitly requested worker fails or is cancelled, Aizen must report that
  result instead of silently doing the worker's task itself unless fallback was
  requested.
- Failed `worker_start` and `worker_message` calls are marked terminal for that tool
  batch and include `AUTOMATIC_RETRY_BLOCKED`; a fresh user message must explicitly
  authorize retry or fallback.
- Worker identities and personalities come from the directory, not model memory.
- Each turn uses a fresh isolated child `AgentHarness`.
- Worker conversations carry only bounded caller messages and final worker answers.
- Hidden reasoning and child tool transcripts are never copied into shared context.
- Children never receive worker/delegate tools, so nesting is impossible.
- Worker tools are read-only and workspace-guarded.
- There is no built-in worker timeout. Hosts may explicitly configure one.
- Parent/user cancellation calls `AgentHarness.abort()`.
- Results are typed as `completed`, `failed`, `cancelled`, or optional `timeout`.
- Workers do not write Kioku directly.
- Worker thinking is requested off. Hidden child reasoning and tool transcripts are
  never rendered or copied to Aizen; only the final report crosses the boundary.
- Results report local harness setup time separately from total run time so provider
  latency is not mistaken for orchestration overhead.

Read-only tools are not a complete process/container sandbox. Do not expose this
checkpoint to an untrusted remote channel before the Gateway trust boundary exists.

## Public API

The reusable harness layer is exported as:

```ts
import {
  WorkerDirectory,
  createDelegateTool,
  createWorkerControlTools,
} from "@reitaard/repi-coding-agent/workers";
```

Hosts can start a direct named-worker chat without routing each message through
Aizen. The host keeps the conversation id internally:

```ts
const chat = new WorkerChatController(directory);
const opened = await chat.send("監査", firstMessage);
const reply = await chat.send("Levi", nextMessage);
```

The `/worker` TUI exposes this as a friendly worker chat and keeps run and
conversation ids out of the normal user-facing view. Kanji values are ordinary
search aliases in worker definitions, not hardwired routing behavior.

## Files

- `packages/coding-agent/src/core/delegation/named-worker.ts`
- `packages/coding-agent/src/core/delegation/delegate-tool.ts`
- `packages/coding-agent/src/core/delegation/worker-directory.ts`
- `packages/coding-agent/src/core/delegation/worker-tools.ts`
- `packages/coding-agent/src/core/delegation/worker-registry.ts`
- `packages/coding-agent/src/core/agent-session-services.ts`
- `packages/coding-agent/test/delegation.test.ts`
- `packages/coding-agent/test/delegation-isolation.test.ts`
- `packages/coding-agent/test/worker-directory.test.ts`
- `packages/coding-agent/test/worker-failure-policy.test.ts`
- `docs/AGENT_ORCHESTRATION_PLAN.md`

## Verification

From the repository root:

```bash
npm --prefix packages/agent run build
npm --prefix packages/coding-agent test -- \
  test/delegation.test.ts \
  test/delegation-isolation.test.ts \
  test/worker-directory.test.ts \
  test/worker-failure-policy.test.ts
npm --prefix packages/coding-agent run build
npm --prefix packages/agent run test:harness
npm --prefix packages/coding-agent test -- test/recode-shiori.test.ts
```

Live test requirements:

1. `worker_list` reports Mayuri and Levi with canonical ids and personalities.
2. Two `worker_start` calls can be launched in the same turn.
3. Each result returns a conversation id and canonical worker id.
4. `worker_message` continues one chosen conversation.
5. No 300-second timeout occurs.
6. A failed worker batch does not start fresh worker conversations automatically.
7. Aizen does not perform an explicitly assigned worker task after worker failure
   unless the user requested fallback.
8. Direct host conversations preserve the selected worker identity and conversation
   while keeping the technical conversation id internal.

The 2026-07-18 Windows checkpoint passed 32 focused tests and one real source-CLI
Levi start/continue flow. The live check required `-ne` because the separately
installed `pi-web-access` extension still depends on a missing upstream package
compatibility alias; that extension defect is not a worker-harness failure.
The completed UI checkpoint also passed a source-CLI alias lookup using `監査`.
