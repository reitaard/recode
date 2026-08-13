# jcode audit

> **2026-07-30 release checkpoint:** the current cross-product decision now uses exact jcode tag `v0.54.4` at `fb7a5ea501e56084fa665b91b52ece9ab7761c3c` and the official Windows x64 binary with SHA-256 `2572765b72f776ef4bfdd41efc055e0078910d60aae600aa35c6b1fcb5f54523`. Binary version/help and bounded daemon-control probes were executed. See [`analyze/COMPARE.md`](COMPARE.md). The audit below remains the later-master static source review at `a92b270b`.

## Scope and provenance

- Repository: <https://github.com/1jehuang/jcode>
- Audited commit: [`a92b270b30e0a3a7fadf5e00594a2cc9af1c5888`](https://github.com/1jehuang/jcode/tree/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888), cloned locally at `C:\Users\re_Lax\AppData\Local\Temp\jcode-zFW7Iw`.
- Audit type: static source/documentation review. The machine does not currently have a Rust toolchain or a built jcode binary, so tests and published performance numbers were not reproduced locally.
- Repository scale at this commit: 81 Cargo workspace members, 1,202 Rust files, approximately 263,000 Rust lines, and 7,559 `#[test]`/`#[tokio::test]` declarations. These counts indicate a substantial implementation and test surface, not that every documented feature is complete.
- This document audits jcode independently. It does not yet compare jcode with Recode.

## Overall assessment

jcode is not merely a mock-up or thin wrapper. It has a broad implemented Rust agent platform built around a persistent server, lightweight clients, server-owned sessions, provider runtimes, semantic memory, swarm coordination, stdio MCP, Firefox browser automation, cross-platform release automation, and a large test suite.

Its strongest architectural decision is sharing expensive process state through one daemon rather than launching a complete harness for every session. Its weakest areas are claim precision, benchmark reproducibility, build complexity, incomplete general safety controls, and several prominent features whose documentation explicitly says proposed, draft, partial, or planned.

## Verified feature surface

### Persistent server and session model

- One server owns many sessions and clients reconnect to it over platform transport. The documented lifecycle includes daemon startup, client reconnect, idle shutdown, and hot reload ([server architecture](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/docs/SERVER_ARCHITECTURE.md#L9-L89)).
- This design can amortize provider, model, embedding, MCP, and session-management state across active clients.
- Important boundary: the server is multi-session, but each current client normally attaches to one session. A client containing several session surfaces is explicitly **proposed**, not current behavior ([multi-session client status](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/docs/MULTI_SESSION_CLIENT_ARCHITECTURE.md#L1-L31)).

### Agent memory

- Implemented memory features include persistence, local MiniLM embeddings, cosine retrieval, asynchronous relevance verification, graph links, BFS cascade retrieval, confidence updates, end-of-session extraction, import/export, and duplicate/contradiction handling on write ([implementation checklist](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/docs/MEMORY_ARCHITECTURE.md#L705-L759)).
- The design is more than plain transcript search: it includes semantic retrieval and a graph-oriented memory model.
- Full ambient graph consolidation remains incomplete. Graph-wide merging, stale fact verification, weak-memory pruning, cross-session relationship discovery, and graph optimization are unchecked work ([remaining consolidation work](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/docs/MEMORY_ARCHITECTURE.md#L763-L774)). The README statement that ambient mode periodically reorganizes memories and checks staleness/conflicts is therefore broader than the documented implementation ([README claim](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/README.md#L264-L274)).

### Swarm coordination

- Swarm support is documented as “largely implemented.” It includes bounded spawning modes, hierarchy/ownership, DMs, broadcasts, shared plans, task assignment, lifecycle reporting, optional worktrees, and crash/reload recovery ([swarm status and model](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/docs/SWARM_ARCHITECTURE.md#L1-L57)).
- Normal/light swarms use one-level fan-out. Recursive descendants require `swarm-deep` and remain bounded by worker/member limits.
- Conflict handling is optimistic and lock-free; agents must communicate and use touch notifications ([conflict handling](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/docs/SWARM_ARCHITECTURE.md#L302-L318)). The README’s phrase “all conflicts automatically resolved” overstates automatic detection/notification as guaranteed resolution ([README claim](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/README.md#L307-L317)).

### Providers

- jcode has native targets for major provider families and a shared OpenAI-compatible runtime. The provider target enum distinguishes native targets from compatibility profiles ([provider target types](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/crates/jcode-provider-metadata/src/lib.rs#L21-L40)).
- The provider catalogue is broad, but many named services are metadata profiles over the same OpenAI-compatible protocol rather than independent provider implementations ([catalog](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/crates/jcode-provider-metadata/src/catalog.rs#L385-L435)).

### MCP

- MCP has a concrete manager with a daemon-shared pool by default and per-session ownership for stateful servers. Connection-on-call is bounded to 30 seconds ([manager design](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/crates/jcode-base/src/mcp/manager.rs#L1-L19)).
- Configuration supports canonical `mcpServers` naming and shared/non-shared servers.
- Current transport support is **stdio only**. HTTP, SSE, and streamable HTTP entries are recognized but skipped ([transport restriction](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/crates/jcode-base/src/mcp/protocol.rs#L160-L218)).

### Browser automation

- Browser automation is implemented around Firefox Agent Bridge, including installation assets, native host identifiers, per-session bridge processes, and capability probes ([Firefox implementation](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/crates/jcode-base/src/browser.rs#L1-L112)).
- The generalized Firefox/Chrome/Safari/WebDriver provider protocol is still marked **draft**, with adapters and conformance work proposed ([protocol status](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/docs/BROWSER_PROVIDER_PROTOCOL.md#L1-L20)). Current public support should be described as Firefox-backed rather than generally multi-browser.

### Cross-platform distribution

- Release automation covers Linux x64/arm64, macOS arm64/x64, Windows x64/arm64, and FreeBSD x64, with Windows signing paths and checksum generation ([release matrix](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/.github/workflows/release.yml#L50-L84), [Windows jobs](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/.github/workflows/release.yml#L170-L212), [FreeBSD job](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/.github/workflows/release.yml#L414-L480)).
- Windows uses native named pipes rather than emulated Unix sockets ([Windows documentation](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/docs/WINDOWS.md#L139-L149)).
- Release documentation and workflow behavior need reconciliation: documentation says successful platforms publish independently, while the current final validation enumerates a complete expected asset set before final publication ([workflow validation](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/.github/workflows/release.yml#L484-L525)).

## Performance evidence audit

### Published startup numbers

The README reports:

- jcode first frame: **14.0 ms** median, 10.1–19.3 ms range
- jcode first input: **48.7 ms** median, 30.3–62.7 ms range
- ten interactive PTY launches on an unspecified Linux machine ([results](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/README.md#L188-L223)).

The benchmark harness is credible and inspectable: it launches tools in an 80×24 PTY, renders terminal output through `pyte`, records first meaningful visible content, sends a fixed probe, and waits for probe echo ([method](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/scripts/bench_startup_visible_ready.py#L1-L10), [measurement loop](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/scripts/bench_startup_visible_ready.py#L128-L240)).

Qualification:

- These are author-published measurements, not independently reproduced results.
- Hardware, kernel, filesystem/cache state, authentication state, and raw per-run artifacts are not provided in the README.
- Tool treatment is not fully uniform: jcode explicitly disables updates, telemetry, and self-dev; Antigravity used an unauthenticated screen and a special log marker ([tool definitions](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/scripts/bench_startup_visible_ready.py#L86-L117)).
- “First visible frame” is not the same lifecycle point as provider readiness, completed session restoration, or RPC readiness. It must only be compared with an equivalent TUI-render metric.

### Published memory numbers

The README reports 27.8 MB PSS for one memory-disabled session and 117.0 MB for ten, versus 167.1/260.8 MB with local embeddings enabled ([RAM tables](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/README.md#L62-L179)).

The harness correctly reads Linux `smaps_rollup` and sums PSS across descendants/process groups ([PSS implementation](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/scripts/bench_memory_cli.py#L275-L330)). However, jcode is measured as one shared server plus N clients, while competitors are generally N independent processes ([topology](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/scripts/bench_memory_cli.py#L335-L430)). This fairly measures jcode’s intended deployment architecture but is not topology-neutral.

The README identifies the benchmarked jcode build as `be386f2`, not the audited `a92b270…` commit ([versions](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/README.md#L242-L252)).

## Risks and incomplete areas

1. **P0 — Benchmark reproducibility:** retain raw JSON, hardware/environment manifests, cache/auth state, and exact binary hashes. Randomize benchmark order and publish results from the audited/released commit.
2. **P0 — Safety boundary:** the broad safety architecture document is still marked “Design,” with its main classifier, persistent review queue, permission tool, transcript logger, UI, and configuration checklist shown incomplete ([safety status](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/docs/SAFETY_SYSTEM.md#L1-L17), [implementation plan](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/docs/SAFETY_SYSTEM.md#L510-L539)). There is implemented destructive-command gating and ambient-session permission handling, but this is not equivalent to a complete sandbox or general approval boundary ([bash gate](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/crates/jcode-app-core/src/tool/bash_destructive_gate.rs#L1-L44)).
3. **P1 — Claim precision:** qualify automatic conflict resolution, ambient consolidation, multi-session client UI, and multi-browser support according to their architecture documents.
4. **P1 — Build/maintenance cost:** the workspace is very large and default features include PDF, embeddings, and Bedrock ([default features](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/Cargo.toml#L207-L233)). The README itself reports an approximately one-minute cached incremental debug build and targets 5–20 seconds ([build-speed note](https://github.com/1jehuang/jcode/blob/a92b270b30e0a3a7fadf5e00594a2cc9af1c5888/README.md#L619-L619)). This makes self-development and contribution iteration a material weakness despite extensive crate splitting.
5. **P1 — Protocol breadth:** MCP is stdio-only and browser automation is Firefox-only today; public language should not imply complete transport/backend coverage.
6. **P2 — Documentation drift:** release behavior, feature status, and marketing claims are not consistently synchronized with current source and architecture status.

## Audit verdict

jcode has a credible and ambitious implemented core. Its persistent shared-server architecture gives it a plausible structural advantage for startup display and multi-session memory scaling. Memory, swarm, provider, MCP, browser, and release systems all have real source behind them.

The published benchmark figures remain self-measured claims until reproduced from an identified release on controlled hardware. Several headline statements collapse “implemented in part” and “planned general form” into one marketing description. The product should be evaluated as a strong server-centric coding harness with incomplete general safety and some overstated edges—not as vaporware, but not as fully matching every README claim either.
