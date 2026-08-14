# `@reitaard/recode-telemetry`

Vendor-neutral callback telemetry contracts and typed schema utilities for Recode packages. Node `>=22.19.0` is required by the package manifest.

> The package participates in the synchronized private `0.1.2` release candidate. npm publication remains disabled.

## Public entry points

| Import | Purpose |
|---|---|
| `@reitaard/recode-telemetry` | Context/span interfaces, no-op and memory implementations, schema definitions, and type helpers |
| `@reitaard/recode-telemetry/testing` | Runner-independent adapter conformance cases and fixture types |

## Explicit propagation

Telemetry has no ambient global context. A caller passes a `TelemetryContext` and starts work inside a callback:

```ts
import { InMemoryTelemetryContext } from "@reitaard/recode-telemetry";

const telemetry = new InMemoryTelemetryContext();

const result = await telemetry.startSpan(
  { name: "example.operation", attributes: { attempt: 1 } },
  async (span) => {
    span.addEvent("started", { cached: false });
    span.setAttributes({ outcome: "complete" });
    return 42;
  },
);
```

`TelemetrySpan` is itself a context, so `span.startSpan(...)` creates an explicit child. The callback result or rejection is preserved. A thrown or rejected value sets error status unless the span already received an explicit status. Calls made after settlement are inert.

Supported attribute values are strings, numbers, booleans, and readonly arrays of those scalar types. `undefined` attributes are omitted.

Use `NOOP_TELEMETRY_CONTEXT` when recording is disabled. It still executes the callback and preserves its result; it does not record data.

## In-memory recorder

`InMemoryTelemetryContext` records detached snapshots in span-start order:

```ts
const spans = telemetry.getSpans();
```

Snapshots contain IDs, parent IDs, attributes, ordered events, status, settlement state, and completion sequence. The recorder is process-local, unbounded, and intended as a reference implementation or test fixture—not durable production storage.

Recording is passive: unreadable telemetry payloads are ignored rather than allowed to break application work.

## Typed schemas

`defineTelemetrySchema()` preserves a serializable schema value while TypeScript helpers infer span names and start/end/event attributes. `createTypedSpanStarter(context, schemas)` binds one explicit parent context to one or more schemas:

```ts
import {
  createTypedSpanStarter,
  defineTelemetrySchema,
  NOOP_TELEMETRY_CONTEXT,
} from "@reitaard/recode-telemetry";

const schema = defineTelemetrySchema({
  version: 1,
  spans: {
    "example.request": {
      description: "One request",
      parents: { kind: "root_or_external" },
      startAttributes: {
        provider: { type: "string", required: true, description: "Provider ID" },
      },
      endAttributes: {},
      status: { default: "ok", errorWhen: "The request fails" },
    },
  },
});

const startSpan = createTypedSpanStarter(NOOP_TELEMETRY_CONTEXT, [schema]);
await startSpan("example.request", { provider: "demo" }, async () => undefined);
```

Schemas provide compile-time inference only. This package does not validate schema values at runtime, redact sensitive data, enforce cardinality, serialize spans, or export them. Adapters and callers own those responsibilities.

## Adapter conformance

The testing entry point exposes `createTelemetryAdapterConformance(factory)`. A fixture supplies a context, a way to retrieve recorded spans, and cleanup. The cases verify callback admission, result/rejection preservation, status behavior, attribute/event recording, parentage, post-settlement behavior, and passive failure handling without requiring a specific test runner.

## Integration boundary

The AI package accepts and propagates telemetry contexts. The Agent package owns domain schemas and re-exports generic telemetry APIs. Schema names such as `pi.ai.*`, `pi.harness.*`, and `pi.session.*` are retained compatibility identifiers where present in typed Agent schemas; they are not current product identity.

Do not infer ambient tracing, exporters, persistence, runtime schema validation, or complete product-wide emission from these APIs. Those capabilities are not implemented here, and current verification does not establish that every Agent/Aizen path emits the full domain schema.

## Build and test

From the source workspace after transfer:

```sh
npm run build -w @reitaard/recode-telemetry
npm test -w @reitaard/recode-telemetry
```

The audited upstream checkpoint at `fbd6b5b3` previously passed all 15 focused telemetry tests. Re-run the commands after transfer before treating this document as release authority.
