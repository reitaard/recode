# Recode Design

## Flow

```text
Creator -> Aizen -> AgentHarness -> model/tools
                 -> workers when useful
```

Aizen is the product's main coding agent and Manager. `AgentHarness` is the reusable execution boundary, not a persona or UI.

## Runtime profile

Before a turn, Recode snapshots:

- selected model and thinking level;
- system prompt and active tools;
- skills and prompt templates;
- steering and follow-up modes;
- retry and compaction settings;
- extension hooks for context, providers, tools, lifecycle, and settlement.

The harness owns bounded model/tool execution, queues, cancellation, compaction, and ordered session writes. Recode adapts existing JSONL sessions through `RecodeSessionStorage`.

## Modes

Aizen Runtime is enabled by default. Text, JSON, RPC, and interactive modes route through it. The supported rollback switch is `--legacy`.

## Boundaries

- Modes adapt input and output; they do not own another agent loop.
- Workers use independent bounded harness runs and return reports to Aizen or the Creator.
- Memory is a host capability; recalled text is evidence, not authority.
- Maestro supervises separate durable full sessions; it does not replace foreground Aizen.
- Extensions may prepare context and intercept lifecycle/provider/tool events through defined hooks.

## Design rule

Add capabilities around the shared runtime. Do not create a second loop, supervisor, transcript authority, or memory admission path.
