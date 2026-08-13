# SDK

The package root exports the AgentSession compatibility SDK and supporting settings, auth, models, sessions, tools, resources, extensions, gateway, compaction, and worker types.

```ts
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@reitaard/recode-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const { session } = await createAgentSession({
  authStorage,
  modelRegistry,
  sessionManager: SessionManager.inMemory(),
});

await session.prompt("Inspect this workspace");
```

This example requires configured provider credentials/model availability. Applications should normally pass explicit model/auth/resource/session policy instead of inheriting a user's complete configuration.

## Factories

`createAgentSession()` builds the compatibility session. Tool factories create coding/read-only/individual tools for an explicit working directory. `createAgentSessionServices`, `createAgentSessionFromServices`, and `createAgentSessionRuntime` support advanced dependency injection and runtime replacement. `AgentSessionRuntime` is not the default Aizen product runtime.

## Ownership and cleanup

Callers own process lifetime, credential boundaries, event subscriptions, custom resources, and shutdown. Use in-memory settings/sessions for deterministic tests. Treat default filesystem discovery as executable configuration and resolve project trust explicitly.

Only package root, `./workers`, and `./rpc-entry` are intended entry points, pending transferred-manifest and packed-content verification. The SDK examples must all be compiled and checked for public imports after transfer; the isolated upstream `server/create-harness` adapter is excluded unless repaired and adopted.
