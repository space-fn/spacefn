# Tracing API (`spacefn/trace`)

Tracing is configured from `OTLP_ENDPOINT`, optional JSON `OTLP_HEADERS`, and
optional `OTLP_SERVICE_NAME` fields. The [tracing guide](../guides/tracing.md)
covers setup and exported attributes.

## Middleware and setup

| API                     | Behavior                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `traceConfig()`         | Hono middleware that configures the exporter from the request environment.                    |
| `configureTracing(env)` | Installs or disables the OTLP exporter for a `TraceEnv`.                                      |
| `parseOtlpHeaders(raw)` | Parses a JSON object of string headers; errors do not include secret values.                  |
| `traceRequest()`        | Hono middleware that creates a server span from the matched route and incoming `traceparent`. |
| `traceBindings(env)`    | Returns a cached proxy that instruments supported D1, KV, Queue, and Durable Object bindings. |

`TraceEnv` has optional `OTLP_ENDPOINT`, `OTLP_HEADERS`, and
`OTLP_SERVICE_NAME` values. An empty endpoint disables exporting. The standard
runtime wires tracing automatically; use middleware directly when assembling a
custom Hono app.

## Spans and context

```ts
import { currentSpan, withSpan } from "spacefn/trace";

await withSpan("inventory.refresh", async (span) => {
	span.setAttributes({ "inventory.items": 12 });
	const parent = currentSpan();
});
```

`withSpan(name, fn, options?)` joins the current trace, records errors, and
always ends the span. `SpanOptions` accepts `attributes`, `kind`, and an
explicit `parent`. `Span` can rename itself, add attributes, or mark an error.
`currentSpan()` returns the active `SpanContext`; `setTracer()` installs a
custom `Tracer`, and `getTracer()` reads it. A `Tracer` implements
`onEnd(record)` and may implement `flush()`. `SpanRecord` contains trace and
span IDs, name, kind, optional parent span ID, start/end epoch milliseconds,
attributes, and an optional error. `SpanKind` is
`internal | server | client | producer | consumer`; `Attributes` maps strings
to string, number, or boolean values.

`parseTraceparent(value)` parses a W3C traceparent header and returns
`undefined` for malformed or zero IDs. `formatTraceparent(context)` formats a
`SpanContext` as a W3C header. `tracedFetch(input, init?)` adds a client span
and propagates trace context; it records only the host, not the full URL.

## Binding instrumentation

`isD1`/`traceD1`, `isKV`/`traceKV`, `isQueue`/`traceQueue`, and
`isDurableNamespace`/`traceDurableNamespace` expose the same duck-typing and
wrapping logic used by `traceBindings`. Their `D1Like`, `KVLike`, and
`QueueLike` types describe the minimum binding surface. SQL text is recorded
for D1 spans; KV keys, queue bodies, and Durable Object RPC arguments/results
are not recorded.

## Logs and OTLP

`createLogger(fields?)` returns a `Logger` with `debug`, `info`, `warn`,
`error`, and `child` methods. Records include time and active trace/span IDs.
`setLogSink(sink)` replaces the default JSON console sink. `LogRecord`,
`LogFields`, `LogLevel`, and `LogSink` describe logger data.

`createOtlpExporter(options)` buffers span records and exports OTLP/JSON on
`flush()`. `OtlpOptions` takes `endpoint`, `serviceName`, optional `headers`,
and test hooks `fetch` and `onError`. `toOtlpRequest(records, serviceName)`
builds the OTLP/JSON request shape. Export failures are reported but do not
fail the request, and sensitive attribute keys are redacted.
