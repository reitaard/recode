> Updated 2026-07-22: Phase 0 and the production AgentHarness migration checkpoints are complete. Recode now
> snapshots Aizen's minimal runtime profile and adapts the existing JSONL
> `SessionManager` to Pi's `SessionStorage` contract. A focused Phase 1C proof
> runs one Aizen turn through `AgentHarness` and reopens the same persisted tree.
> Text, JSON, RPC, and interactive runs use Aizen Runtime by default. The
> temporary `--legacy` flag and settings toggle remain as the rollback
> path for this release. Loaded skills, prompt templates, and
> `before_agent_start`, context, provider-payload/response, and tool interception
> now cross that boundary. Provider headers and lifecycle events now preserve
> their legacy timing, while the opt-in path reuses RePi's retry and compaction
> settings. Aizen's JSON route preserves the session header and lifecycle,
> retry, compaction, and settlement event contract. The legacy runtime remains
> available until the final duplicated-lifecycle removal gate. Aizen also writes model-invisible,
> structured operation, turn, and tool boundaries into the existing session
> JSONL. On restart, unfinished work is marked interrupted and uncertain tool
> calls are never replayed automatically. These records are the diagnostic
> source for a future Inspector agent.
> Start with
> `docs/AGENT_RUNTIME_INSPECTION.md`, then use `docs/AGENTHARNESS.md` and
> `docs/JARVIS_BUILD_PLAN.md` for the parity and stop/go gates.
>
> Telegram is now the first authenticated channel checkpoint. Its narrow path is
> `Telegram Bot API -> Recode Gateway -> Aizen RPC -> AgentHarness -> JSONL session`.
> This adopts OpenClaw's gateway/channel separation without copying its agent loop
> or full multi-channel control plane. See `packages/coding-agent/docs/telegram.md`.

The earlier audit below is retained as historical evidence. Its Windows paths
and statements that delegation is still future work are superseded by the live
plans above.

The next task was **Phase 0: repair the Windows harness boundary**, followed immediately by a one-shot AgentHarness migration spike.

The plans are directionally correct, and the new memory/LSP work has not diverted the architecture.

## What the audit confirmed

The dedicated AgentHarness suite currently reports:

- **119 tests passed**
- **12 tests failed**
- All failures are Windows portability issues.
- Core harness lifecycle, persistence, compaction helpers, queue behavior, save points, tool hooks, stream snapshots, and abort tests passed.

The failures are specifically:

1. `FileInfo.name` is derived by splitting only on `/`, so Windows paths become the entire absolute path.
2. Skill and prompt-template helpers also assume `/`, causing invalid absolute paths to reach the `ignore` package.
3. Git Bash reports `/tmp/...` while the test expects the Windows `C:\...\Temp\...` representation.
4. Four tests create symlinks without checking whether Windows Developer Mode or symlink privileges are available.

This directly validates [Phase 0 in the Jarvis plan](C:/Users/re_Lax/Desktop/chat7/re.pi/docs/JARVIS_BUILD_PLAN.md:23).

## Recommended build order

### 1. Fix the Windows execution boundary

Do this first as one tightly scoped checkpoint:

- Use cross-platform basename/path handling in `NodeExecutionEnv`.
- Normalize environment paths inside skill and prompt loaders.
- Accept Windows and Git-Bash path representations at the execution boundary.
- Do **not** rewrite arbitrary shell stdout merely to change `/tmp` into `C:\...`; fix the test or compare canonical equivalents.
- Add a symlink capability probe and skip only symlink-dependent assertions when Windows refuses creation.
- Run the complete harness suite until it reaches 131/131, or has explicit capability skips.
- Re-run the binary smoke tests outside the repository.

This is a real defect, but it is small foundation work—not an AgentHarness redesign.

### 2. Write the explicit responsibility map

The current [AgentSession](C:/Users/re_Lax/Desktop/chat7/re.pi/packages/coding-agent/src/core/agent-session.ts:272) is still a roughly 3,000-line application coordinator. It currently owns:

- Agent loop orchestration.
- Model and thinking selection.
- Tools and system-prompt construction.
- Extensions and hooks.
- Queued messages.
- Auto-compaction and retry.
- LSP composition.
- Bash execution.
- Session navigation/export.
- UI-facing events.

The map should assign each responsibility to one of:

- `AgentHarness`
- coding-agent application adapter
- `AgentSessionRuntime`
- TUI/print/RPC mode
- host service such as memory or LSP

This is the first unchecked near-term item in the plan and prevents accidentally duplicating lifecycle logic.

### 3. Build a non-production one-shot AgentHarness adapter

Start with print mode, because [print-mode.ts](C:/Users/re_Lax/Desktop/chat7/re.pi/packages/coding-agent/src/modes/print-mode.ts:32) is much smaller and less coupled than RPC or interactive mode.

The first spike should prove one request with:

- Existing model and authentication.
- Existing system prompt and context files.
- Existing coding tools.
- Skills and prompt templates.
- Existing JSONL session persistence.
- Text and JSON event output.
- Proper shutdown and exit codes.

Do not move memory or LSP yet. Feed their existing behavior through the adapter only when the first path actually needs it.

### 4. Fix only the harness primitives exposed by that spike

The [AgentHarness migration handoff](C:/Users/re_Lax/Desktop/chat7/re.pi/docs/AGENTHARNESS.md:83) is right: avoid designing abstractions without a consumer.

Expected blockers, in likely order:

1. Extension/hook parity, especially `before_agent_start`.
2. `settled`, follow-up, and abort barrier semantics.
3. Auto-compaction decision points.
4. Current coding-agent retry behavior.
5. Minimal model-selection validation.
6. Session facade and deterministic busy-time writes.

If the adapter needs private harness state or recreates lifecycle behavior, stop and add the missing public harness primitive. Those stop conditions are correctly documented in [AGENTHARNESS.md](C:/Users/re_Lax/Desktop/chat7/re.pi/docs/AGENTHARNESS.md:139).

### 5. Add minimum durability before switching production traffic

After functional one-shot parity, implement the minimum journal:

- Queue accepted/consumed entries.
- Pending-write accepted/applied entries.
- Operation and turn start/finish/interrupted entries.
- Conservative recovery of unfinished turns.
- Never automatically repeat an uncertain non-idempotent tool call.

This should follow the existing semi-durable design rather than attempting to serialize models, tools, callbacks, or extensions.

### 6. Migrate modes in this order

1. Print/one-shot.
2. RPC.
3. Interactive TUI.
4. Remove the old loop only after all parity gates pass.

Interactive should remain last because it adds UI bindings, dialogs, command handling, session switching, streaming state, and queue behavior.

### 7. Then create the assistant service

Only after the coding path genuinely runs through AgentHarness:

- Create `packages/assistant`.
- Promote memory and LSP behind the smallest interfaces proven by the adapter.
- Add lazy `SourceService`.
- Add a local authenticated gateway.
- Then scheduling and background jobs.
- Channels and delegation later.

## What should not be next

Do not work on these yet:

- More memory features.
- More LSP features.
- OpenClaw gateway code.
- Scheduler or background goals.
- `packages/assistant`.
- Speculative `MemoryService` or `CodeIntelligenceService`.
- Interactive-mode migration.
- Multi-agent or sandbox architecture.

Memory and LSP are already usable coding-agent implementations. Their future extraction is migration debt, not damage.

## One plan adjustment

The plan says to finish several broad AgentHarness systems before migration. I would refine that slightly:

> Fix Windows first, create the responsibility map, then build the smallest one-shot adapter. Use that adapter to reveal which lifecycle, hooks, model, and durability primitives must be completed.

That avoids both extremes: prematurely designing everything and forcing a workaround-heavy migration.

The checkout remains clean; this was a read-only audit.
