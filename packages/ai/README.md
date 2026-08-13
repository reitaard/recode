# Recode AI

`@reitaard/recode-ai` is Recode's provider-neutral model, authentication, message, tool, streaming, image, and catalog layer. It separates provider ownership from wire-protocol implementations and keeps the preferred root API side-effect-light.

> **Migration status:** source and manifest are present under the standalone `0.1.0` identity. Installation, build, tests, consumer compilation, package-content certification, and publication remain pending until root workspace infrastructure and dependencies are transferred.

## Public entry points

| Import | Contract |
|---|---|
| `@reitaard/recode-ai` | Preferred core types, `Models`, auth/storage contracts, streams, messages, tools, validation, image-model types, faux provider, and helpers. No generated catalogs or provider factories are registered by importing root. |
| `@reitaard/recode-ai/providers/*` | One provider factory/catalog per provider; `providers/all` is the explicit heavy aggregate. |
| `@reitaard/recode-ai/api/*` | Direct wire-protocol implementations and lazy wrappers for advanced integrations. |
| `@reitaard/recode-ai/oauth` | OAuth helpers/implementations. |
| `@reitaard/recode-ai/bedrock-provider` | Bedrock-specific provider helper boundary. |
| `@reitaard/recode-ai/compat` | Side-effectful legacy global registry/catalog API retained for compatibility. New code should not start here. |

Wildcard exports cover shipped files, not arbitrary provider/API names. Verify a concrete subpath against package contents.

## Preferred model collection

```ts
import { createModels, Type, type Context, type Tool } from "@reitaard/recode-ai";
import { anthropicProvider } from "@reitaard/recode-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());

const model = models.getModel("anthropic", "<catalog-model-id>");
if (!model) throw new Error("Model is absent from the reviewed catalog");

const tools: Tool[] = [{
  name: "lookup",
  description: "Look up a value",
  parameters: Type.Object({ key: Type.String() }),
}];

const context: Context = {
  systemPrompt: "Answer using the supplied tools when needed.",
  messages: [{ role: "user", content: "Find the value", timestamp: Date.now() }],
  tools,
};

const stream = models.stream(model, context);
for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}
const response = await stream.result();
```

The example requires configured authentication and a model ID present in the transferred generated catalog. It deliberately does not promise a particular remote model remains available.

Use `builtinModels()` from `providers/all` only when registering every built-in provider is intentional. Individual factories preserve clearer ownership and better bundling.

## Providers, APIs, and catalogs

A `Provider` owns:

- stable ID/name and optional base URL/headers;
- provider-scoped authentication;
- a synchronous last-known model list;
- optional dynamic model refresh and filtering;
- streaming/completion behavior, often delegated to a shared API implementation.

A `Models` collection registers providers, looks up models, resolves auth, refreshes dynamic catalogs, and dispatches requests. `getModels()` and `getModel()` are synchronous last-known reads. A failing provider list is treated as empty. `refresh()` returns `{ aborted, errors }` rather than rejecting for ordinary per-provider failures; static, unknown, and unconfigured providers are skipped.

Generated built-in catalog JSON, typed provider model modules, aggregate `models.generated.ts`, and `.manifest.json` are reviewed source inputs. Runtime/provider availability can change after generation. Catalog presence does not certify credentials, quotas, regional access, upstream service health, or every optional capability.

Routine deterministic builds must compile reviewed checked-in catalogs without fetching replacements. The inherited `build` script currently performs network-backed model/image generation, while `build:release` compiles existing inputs. Standalone build scripts must make this distinction explicit before certification.

## Authentication

Authentication is provider-scoped. `createModels()` defaults to an in-memory credential store; applications inject persistent storage. A `CredentialStore` exposes provider-keyed `read`, serialized `modify`, `delete`, and listing operations. OAuth refresh occurs through the serialized modification boundary to avoid double-refresh inside the store's concurrency model.

Stored credentials own their provider: a failed stored OAuth refresh does not silently fall back to an environment key. `checkAuth()` checks completeness without refreshing OAuth; `getAuth()` resolves effective auth and reports a source label; `login()` and `logout()` use provider-owned methods. Unknown/unconfigured providers resolve as unavailable, while broken auth/storage paths surface `ModelsError` categories.

Explicit request `apiKey`, environment overrides, and headers are sensitive. Callers are responsible for durable-store encryption/permissions, redaction, process environment, browser secret handling, and avoiding logs. Ambient AWS/Google credentials remain external SDK/platform boundaries.

## Messages and streams

`Context` contains a system prompt, messages, and optional tools. Messages are user, assistant, or tool-result records. Content can contain text, thinking, images, and tool calls according to role. Usage includes input/output/cache accounting, optional reasoning tokens, and provider-reported cost estimates.

After a valid provider/model dispatch invokes a `StreamFunction`, request/model/runtime failures are expected to terminate through stream events/results rather than synchronous throws. Callers must still handle synchronous errors from their own setup, invalid lookup assumptions, provider implementations that violate the contract, and collection/auth operations documented as rejecting. Event consumers must use `contentIndex`: text, thinking, and tool-call events may interleave. Partial tool arguments are best-effort incomplete JSON and must never be executed before the terminal tool-call record is validated.

`complete()` awaits the same stream result. `streamSimple()`/`completeSimple()` normalize reasoning options across providers. Abort signals, request timeout, retry cap, maximum retry delay, transport, cache retention, session affinity, response/payload callbacks, custom fetch, provider environment, headers, and telemetry context are request boundaries; individual APIs may ignore or reject unsupported options.

Stop reasons include `pending`, `stop`, `length`, `toolUse`, `error`, `aborted`, and `deferred`. Preserve provider `rawStopReason`/redacted diagnostics for troubleshooting without treating them as portable control flow.

Deferred responses are provider-capability-specific. Use returned handles only with the owning provider/model, honor expiry/poll guidance, and treat cancellation as best effort.

## Tools and validation

Tool parameters use TypeBox-compatible schemas. Validate complete tool calls with exported validation helpers before execution. Constrained sampling is provider-dependent and does not replace host validation or authorization.

Tool results can contain text and images. Match `toolCallId` and `toolName`, set `isError` accurately, and never treat model-generated arguments as trusted paths, shell commands, URLs, or credentials.

A known generated-validator compatibility defect remains at the audited checkpoint: the nullable-array case in `test/validation.test.ts` can throw while reading `.every` from `null`. The interpreted fallback succeeds, but that does not certify the generated path. Repair and rerun the deterministic suite before release.

## Images and reasoning

Image input uses base64 data plus MIME type and should be sent only to models advertising image input. Applications own byte limits, MIME validation, privacy, and memory usage. Image generation has separate model/provider collections and API registration; it is not implied by text-provider registration.

Thinking levels are a unified request vocabulary mapped to provider-specific controls. Providers can omit, redact, sign, replay, or account for reasoning differently. Do not expose hidden/signature payloads as normal text or assume reasoning token reports are comparable across providers.

## Custom providers and APIs

Prefer a provider factory when an existing API implementation matches the service. Implement `Provider` with deterministic `getModels()`, provider auth, stream methods, and optional refresh/filter/deferred methods. Dynamic refresh must restore cached state before optional network work, honor the supplied signal, retain previous state on failure, and publish through the generation-checked callback.

Create a new API implementation only for a distinct wire protocol or option contract. Direct `api/*` imports bypass some collection-level policy, so callers must apply authentication and request controls deliberately.

Provider-addition checklist:

1. add provider factory and typed model module;
2. add/update generator source, reviewed JSON catalog, and manifest;
3. register it in `providers/all` only when intended as built-in;
4. expose/test the concrete wildcard subpath and lazy API boundary;
5. implement provider-scoped auth without credential fallback surprises;
6. add deterministic conversion/stream/error/abort tests;
7. isolate credential-backed, network, OAuth, and local-model tests;
8. verify bundling does not eagerly load unrelated SDKs;
9. document environment and regional requirements without sample secrets.

## Compatibility API

`@reitaard/recode-ai/compat` registers built-in API providers and exposes old global `stream`, `complete`, catalog getters, image APIs, and registry mutation. It exists for coding-agent and inherited integrations. It has side effects and a broader bundle; new applications should use `createModels()` and provider factories. Do not mix compatibility registry overrides with preferred collection dispatch unless ownership and cleanup are explicit.

## Browser and bundling boundaries

The root entry avoids generated catalogs, provider factories, OAuth implementations, and compatibility registration, but some concrete providers rely on Node SDKs, ambient files, process environment, proxies, or OAuth browser/device flows. Browser consumers must select browser-capable subpaths, pass credentials explicitly through a secure host, and test their bundler. Package `sideEffects` declarations intentionally preserve compatibility/image registration modules.

Tree shaking depends on using individual provider/API subpaths and bundler behavior. `providers/all` and `compat` are intentionally heavy. Lazy wrappers defer SDK loading until first use; they do not make a Node-only SDK browser-compatible.

## Deterministic development and tests

The audited bounded run covered ten selected contract files with local models disabled: nine files passed and one failed, producing 137 passing tests, 196 credential/network-gated skips, and the single generated nullable-array validator failure described above. It was not the default/full 128-file suite, and `PI_NO_LOCAL_LLM=1` alone does not guarantee that every selected test is credential-free or network-free. Counts are checkpoint evidence, not permanent expectations.

For standalone certification:

- keep `PI_NO_LOCAL_LLM=1` for default gates;
- do not expose provider credentials to untrusted tests or fork CI;
- separate deterministic unit/catalog validation from live provider/OAuth tests;
- never allow default tests to pull Ollama or other large local models;
- compile checked-in catalogs without network refresh;
- run generation only as a separately reviewed network workflow and inspect diffs;
- test abort, error-body redaction, retries, message conversion, lazy loading, auth, and catalog/schema validation;
- inspect packed exports and run a consumer import/tree-shaking smoke test.

Node.js must satisfy the repository engine floor. Browser, Bedrock, OAuth, local-model, and live-provider certifications are separate gates.
