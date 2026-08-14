# `@reitaard/recode-storage-sqlite-node`

Optional Node SQLite storage for Recode AgentHarness sessions. It uses the built-in `node:sqlite` module and requires Node `>=22.19.0`.

> The package participates in the synchronized private `0.1.2` release candidate. This backend is not the coding-agent default; npm publication remains disabled.

## Public API

The package has one root export. Its principal APIs are:

- `createNodeSqliteFactory()` — adapts `node:sqlite`'s synchronous `DatabaseSync` to the backend capability interface;
- `SqliteSessionRepo` — creates, opens, lists, deletes, and forks AgentHarness sessions;
- `SqliteSessionStorage` — storage implementation used by opened sessions;
- `applyMigrations()` and `loadMigrations()`;
- SQLite database, statement, repository, metadata, and option types.

The AgentHarness dependency is `@reitaard/recode-agent-core`.

## Repository setup

The repository needs an AgentHarness-compatible filesystem environment and a database path:

```ts
import { NodeExecutionEnv } from "@reitaard/recode-agent-core/node";
import {
  createNodeSqliteFactory,
  SqliteSessionRepo,
} from "@reitaard/recode-storage-sqlite-node";

const env = new NodeExecutionEnv({ cwd: process.cwd() });
const repo = new SqliteSessionRepo({
  env,
  sqlite: createNodeSqliteFactory(),
  databasePath: ".recode/sessions.sqlite",
});

const session = await repo.create({ cwd: process.cwd() });
const metadata = await session.getMetadata();

const sessions = await repo.list({ cwd: process.cwd() });
const reopened = await repo.open(metadata);
```

The exact `NodeExecutionEnv` construction must remain synchronized with the transferred Agent package API; compile this example after transfer before release publication.

A session returned by `create()`, `open()`, or `fork()` owns an open database through its storage. Call the storage's cleanup lifecycle when finished. `list()` and `delete()` open and close their own connections.

## Database behavior

Each repository connection:

- resolves the configured path through the supplied filesystem environment;
- creates the parent directory recursively;
- enables WAL mode;
- sets `synchronous=FULL`;
- sets a 5-second busy timeout;
- applies pending migrations before use.

Transactions use `BEGIN IMMEDIATE`, then `COMMIT` or best-effort `ROLLBACK` while preserving the original transaction error.

## Sessions

`SqliteSessionRepo` implements the AgentHarness session repository contract:

- `create(options)` accepts a required `cwd` and optional ID, parent session ID, and metadata;
- `open(metadata)` reopens one session;
- `list()` returns newest sessions first;
- `list({ cwd })` performs exact stored-CWD matching, not normalization or descendant matching;
- `delete(metadata)` removes the session's branch, entry, materialized, sequence, and session records in one transaction;
- `fork(source, options)` copies entries selected by the AgentHarness fork contract and defaults parent/metadata from the source.

The database stores session and branch projections, entries, materialized state, and sequence allocation. It is not a remote coordinator.

## Migrations and packaged assets

Migration SQL is loaded relative to the emitted JavaScript module. The package build must therefore copy:

```text
dist/sqlite/migrations/001_initial.sql
```

alongside compiled output. `scripts/prepare-dist.mjs copy-sqlite-migrations` is part of the declared build and must not be omitted from release packaging. Checked-in source SQL is authoritative input; `dist/` is regenerated output.

Migrations are ordered and idempotently recorded in a `migrations` table. No downgrade or rollback migration contract is provided.

## Limits

This package does not promise:

- encryption or secret management;
- backup/restore facilities;
- schema downgrades or migration rollback;
- remote or distributed coordination;
- broad multi-process semantics beyond SQLite locking, WAL, and the configured busy timeout;
- use by coding-agent's current JSONL/Kioku storage paths;
- npm availability from the standalone Recode repository.

## Build and test

After root workspace infrastructure and dependencies are transferred:

```sh
npm run build -w @reitaard/recode-storage-sqlite-node
npm exec vitest -- --run \
  packages/agent/test/harness/session/sqlite-session-repo.test.ts \
  packages/agent/test/harness/session/sqlite-session-storage.test.ts
```

The audited upstream checkpoint at `fbd6b5b3` passed the package build and 12 focused Vitest tests, including emission of the migration SQL asset. The storage package currently has no package-local test script; the repository gate owns these AgentHarness contract tests until that boundary is deliberately changed.
