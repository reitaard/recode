# Core Package Map

Read this map before changing architecture or package documentation. Verify exact APIs against current exports, source, and tests.

## Package ownership

| Package | Owns | Canonical detail |
|---|---|---|
| `packages/ai` | model/provider APIs, streaming, authentication, model discovery | package README, exports, provider tests |
| `packages/agent` | low-level agent loop, `Agent`, `AgentHarness`, sessions, hooks, durability | package README, focused package docs, harness/session tests |
| `packages/telemetry` | telemetry context, schemas, and conformance | package README, exports, conformance tests |
| `packages/tui` | terminal rendering, components, input, layout, and overlays | package README, exports, TUI tests |
| `packages/storage/sqlite-node` | Node SQLite session and storage backends | package README, exports, backend tests |
| `packages/coding-agent` | Recode CLI, modes, tools, resources, extensions, Aizen, workers, and memory | package docs, public exports, CLI registration, focused tests |
| `packages/orchestrator` | Maestro service, IPC, durable sessions, and dashboard | package README, CLI/source, Node tests |

All seven packages are root npm workspaces and build participants on the synchronized private `@reitaard/recode-*` `0.1.3` train, including SQLite. Historical wiring is retained only in Git history and is not part of the active package graph.

`packages/evals` is repository test infrastructure, not a runtime package. `packages/protocol`, `packages/client`, `packages/server`, and `packages/session-backends/sqlite-node` are outside the verified root workspace, build, and publication paths.

## Layer boundaries

```text
ai -> agent -> coding-agent
telemetry -> agent and host integrations
tui -> coding-agent interactive UI
storage/sqlite-node -> durable host storage
orchestrator -> Maestro service and full-session supervision
```

Manifests define exact dependency direction.

## Agent core

The agent package has two runtime layers:

- `Agent` and the low-level loop own message/tool execution, event streaming, steering/follow-up queues, and provider transport;
- `AgentHarness` owns turn snapshots, session persistence, operation phases, queues, cancellation, compaction/tree operations, hooks, and ordered writes.

Core lifecycle changes require synchronized implementation, focused tests, package design docs, and public README updates when exported behavior changes.

## Coding-agent core

The coding-agent is the product integration layer. It owns:

- CLI parsing and text, JSON, RPC, and interactive adapters;
- Aizen Runtime integration over `AgentHarness`;
- instruction, skill, prompt, theme, and package resources;
- built-in tools and extensions;
- session services, compaction, export, and interactive behavior;
- named workers, Kioku/Cardinal memory, Teach Mode, and product policy.

`packages/coding-agent/docs/` owns supported user behavior. `binaries/*/docs` contains build copies and is never an edit target.

## Core change procedure

1. Read the package manifest and export map.
2. Read public types and entry points.
3. Read the owning implementation and focused tests.
4. Check dependent packages and adapters.
5. Update the package's canonical detailed documentation.
6. Update top-level docs only when a cross-package boundary changes.
7. Run focused tests and documentation link checks.
