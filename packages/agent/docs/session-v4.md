# Session V4 isolated library

Session V4 is exported from:

```ts
import { /* ... */ } from "@reitaard/recode-agent-core/session-v4";
import { /* conformance helpers */ } from "@reitaard/recode-agent-core/session-v4/testing";
```

It is an independently tested session/storage library. It is **not** the active `AgentHarness` session implementation used by coding-agent. Do not import it from the package root or mix its types with the active V3 session types.

## Model

A V4 session contains:

- immutable entries with IDs, sequence, timestamp, and parent relationship;
- named lane pointers, with `main` as the default view;
- append-only operation and queue records;
- metadata, labels, name, and aggregate stats;
- a merged log of entries and records.

Entry variants include messages, model/thinking/tool changes, compaction, branch summaries, and custom data. Record variants describe operation start/finish, step attempts, tool starts, queue activity, abort requests, deferred writes, and usage.

`Session.view(lane)` returns a lane-scoped tree interface. The full session can create/move lanes, append entries and records, query open operations, and inspect the combined log.

## Durability rules

Every appended entry or record is checked by `assertJsonSerializable()`. It rejects non-finite numbers, cycles, sparse/non-standard arrays, accessors, symbols, non-enumerable properties, non-plain objects, and unsupported primitive types. Storage adapters must not weaken this durable-payload boundary.

Query limits must be positive integers and sequence cursors non-negative integers. Invalid lanes, payloads, queries, and storage conditions use typed `SessionError` codes.

## Context projection

Context builders:

- walk the selected branch;
- apply the latest compaction boundary;
- derive current model, thinking level, and active tools;
- project message/summary entries to agent messages;
- omit custom entries unless a caller supplies a projector;
- permit additional deterministic entry transforms.

Context projection is a read model, not a mutation of the durable log.

## Reducer and recovery state

`validateRecordLog()` detects malformed ordering and record relationships. `reduceLaneState()` derives effective lane configuration, active/open operation state, terminal failure, tool batches, queues, usage, and related recovery information from a bounded record-log slice.

Reducer output does not execute recovery by itself. Hosts decide what durable follow-up is safe.

## Storage implementations

The subpath includes in-memory storage/repository and JSONL repository support. The testing subpath exposes reusable conformance contracts for alternative adapters.

Adapter responsibilities include atomic sequencing, lane-pointer consistency, stable query ordering, metadata/stat accuracy, cleanup, and preserving append-only semantics. JSONL output and indexes are storage implementation details; callers should use repository/session APIs.

## Deliberate boundary

V4 currently does not provide the production coding-agent harness migration, a V4 `AgentHarness`, or automatic conversion of active V3 sessions. Inactive scaffold/branch-summary tests do not establish those capabilities.

Any runtime adoption requires explicit approval, compatibility/migration design, coding-agent integration, storage certification, and full regression gates. Until then:

- root `AgentHarness` documentation describes V3;
- `/session-v4` documentation describes only this isolated library;
- package TODOs must not imply an approved migration.

## Verification

After transfer, run the package's declared tests and the focused Session V4/storage conformance sets. The audited upstream checkpoint at `fbd6b5b3` previously passed 258 focused Session V4, storage, and telemetry tests.
