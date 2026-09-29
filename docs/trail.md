# @spacefn/trail

Sentry-like tracing for SpaceFn apps. One trace per request: server spans, database queries, outbound calls, errors, and browser signals on one timeline. Records are buffered and flushed in the background, and tail-based sampling always keeps failing requests.

## Install

```bash
pnpm add @spacefn/trail
```

## Concepts

| Term          | Meaning                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| Trace         | One request. Every span and event carries the same `traceId`.               |
| Span          | A timed step: the request itself, a query, an outbound call, a render.      |
| Event         | A point-in-time note: errors, logs, breadcrumbs.                            |
| Tail sampling | The keep/drop decision happens at flush time, so error traces are not lost. |

Trace context uses W3C Trace Context (`traceparent`) end to end. The middleware continues an incoming context and stamps `x-trace-id`, `traceparent`, and `Server-Timing` on every response.

## Server setup

```ts
import { Hono } from "hono";
import { trailMiddleware } from "@spacefn/trail/hono";

const app = new Hono();
app.use("*", trailMiddleware({ endpoint: env.WATCH_ENDPOINT, key: env.WATCH_KEY }));
```

| Option          | Default                  | Meaning                                                         |
| --------------- | ------------------------ | --------------------------------------------------------------- |
| `endpoint`      | —                        | Ingest URL. Shorthand for `httpTransport({ endpoint, key })`.   |
| `key`           | —                        | Ingest key, sent as `Authorization: Bearer`.                    |
| `transport`     | —                        | Custom `Transport`. Takes precedence over `endpoint`.           |
| `sampleRate`    | `1`                      | Probability that a clean trace is kept. Errors are always kept. |
| `rootName`      | `http.server.request`    | Name of the root span.                                          |
| `serverTiming`  | `true`                   | Emit the `Server-Timing` header carrying the trace id.          |
| `scheduleFlush` | `executionCtx.waitUntil` | Receives the flush promise.                                     |
| `maxRecords`    | `500`                    | Buffered spans and events per trace before records are dropped. |

Without `transport` or `endpoint` the middleware is inert: no headers, no buffering, zero overhead. Telemetry never throws into the app; transport failures go to `onError`.

The root span covers the whole request, including streamed SSE bodies: it ends when the stream closes, not when the response headers are sent. Thrown handler errors and 5xx responses are recorded with their original error and force the trace to be kept.

## Inside handlers

```ts
import { trailFrom } from "@spacefn/trail/hono";

app.get("/todos", async (c) => {
	const trail = trailFrom(c);
	trail?.event("todos", "loading todos");
	// ...
});
```

Outside the middleware, run code under a trail explicitly:

```ts
import { currentTrail, runWithTrail } from "@spacefn/trail";

await runWithTrail(trail, async () => {
	const span = trail.startSpan("render", "render");
	span.set("component", "todo-list");
	span.end();
});

await trail.span("import", "custom", async (span) => {
	// runs inside the span; thrown errors mark it failed
});
```

## Database queries

Wrap the Kysely dialect once; every query becomes a `db` span under the ambient trail with SQL, row count, and duration. The driver-level seam is deliberate: Kysely's plugin API never calls `transformResult` for failed queries.

```ts
import { trailDialect } from "@spacefn/trail/kysely";

const db = new Kysely({ dialect: trailDialect(new SqliteDialect({ database })) });
```

Works with every Kysely dialect: the wrapper hands each driver its own raw connection object, so dialects with custom connection classes keep working. Verified against `kysely-libsql` (transactions and introspection included) and `kysely-d1` (its unsupported-transaction and unsupported-streaming errors pass through unchanged).

## Outbound calls

`trailFetch()` wraps `fetch` so outbound calls become `http.client` spans and continue the trace on the receiving service through `traceparent`. A 5xx marks the span failed but is returned unchanged.

```ts
import { trailFetch } from "@spacefn/trail";

const fetch = trailFetch();
const res = await fetch("https://api.example.com/things");
```

## Browser

Inject the client script in the SSR layout. It is self-contained (no imports), so it works in PHP-style SSR with Datastar and Bootstrap like any inline script.

```ts
import { clientScript } from "@spacefn/trail/client";
import { trailFrom } from "@spacefn/trail/hono";

app.get("/", (c) => {
	const trail = trailFrom(c);
	return c.html(
		`<!doctype html><html><head>
       <meta name="x-trace-id" content="${trail?.traceId ?? ""}">
     </head><body>
       ${clientScript({ traceId: trail?.traceId ?? "", endpoint: "/_trail/client" })}
     </body></html>`,
	);
});
```

What the script records:

| Signal         | Source                                   |
| -------------- | ---------------------------------------- |
| Page timing    | Navigation timing: TTFB, DOM ready, load |
| Web vitals     | LCP, total layout shift, max interaction |
| JS errors      | `error` and `unhandledrejection` events  |
| Datastar spans | `datastar-fetch` lifecycle events        |
| Trace continue | `traceparent` on same-origin `fetch`     |

Datastar actions are ordinary `fetch` calls, so every click becomes a span that continues the server trace: one click and all server work behind it appear in one timeline. The `<meta name="x-trace-id">` tag lets any other script join the same trace.

Flushes happen on `pagehide`, on tab hide, and on a 10-second heartbeat, via `navigator.sendBeacon` with `fetch keepalive` as fallback. The browser is not sampled client-side: it ships whatever it recorded (`sampleInterval: 1`).

## Ingest API

The middleware and the browser client both send `TrailBatch` JSON. Any endpoint that accepts it works; the platform's ingest worker is one implementation.

```jsonc
{
	"sdk": "0.2.0", // SDK_VERSION
	"key": "wk_...", // browser beacons only (beacons cannot set headers)
	"sampleInterval": 4, // one kept trace represents 4 originals
	"spans": [/* SpanRecord[] */],
	"events": [/* EventRecord[] */],
	"droppedRecords": 3,
}
```

- Server flush: `POST` with `Authorization: Bearer <key>`, `keepalive`, non-2xx throws into `onError`.
- Browser: `sendBeacon` or `fetch keepalive` to the same URL. Respond `202`.

## Sampling and cost

| Knob               | Effect                                                                |
| ------------------ | --------------------------------------------------------------------- |
| `sampleRate`       | Probability a clean trace is kept.                                    |
| incoming `sampled` | A `traceparent` flag of `00` drops clean traces, `01` keeps them.     |
| errors             | Always kept: span failures, recorded errors, and 5xx responses.       |
| `sampleInterval`   | Reported weight of kept traces, for honest counts (`1 / sampleRate`). |
| `maxRecords`       | Per-trace buffer cap; overflow counts into `droppedRecords`.          |

## Runtime support

- Cloudflare Workers: request scope via `AsyncLocalStorage` from `cloudflare:workers`.
- Node and compatible runtimes: `node:async_hooks`.
- Without either, integrations pass through untouched and nothing is recorded.
