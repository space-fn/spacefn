# Tracing

Requests, outbound calls and bindings emit spans in OpenTelemetry form, and export as OTLP/JSON. Any OTLP backend can read them: Honeycomb, Grafana, Axiom, or a self-hosted collector.

Tracing is off until `OTLP_ENDPOINT` is set. Spans are still created, so logs carry trace ids either way.

## Turn it on

Declare the variables in `env.ts`. The endpoint is a secret binding, so it can come from `.dev.vars` or `--secrets-file`:

```ts
export default defineEnv({
	OTLP_ENDPOINT: secret({ optional: true }),
	OTLP_HEADERS: secret({ optional: true }),
	OTLP_SERVICE_NAME: string({ optional: true }),
});
```

| Variable            | Meaning                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `OTLP_ENDPOINT`     | Full traces URL, e.g. `https://api.honeycomb.io/v1/traces`. Empty turns export off. |
| `OTLP_HEADERS`      | JSON object of extra headers, e.g. `{"x-honeycomb-team":"..."}`. Keep tokens here.  |
| `OTLP_SERVICE_NAME` | Service name on every span. Defaults to `spacefn`.                                  |

Bad `OTLP_HEADERS` fails the request with a message that does not include the value.

Export happens after the response, through `waitUntil`. A failed export is logged and dropped, so tracing never fails a request.

## Spans

| Span                                       | Kind     | Created by                                                          | Attributes                                                                                            |
| ------------------------------------------ | -------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `METHOD /route`                            | server   | Every request, named after the matched route, e.g. `GET /users/:id` | `http.request.method`, `http.route`, `http.response.status_code`                                      |
| `HTTP METHOD host`                         | client   | `tracedFetch`                                                       | `http.request.method`, `server.address`, `http.response.status_code`                                  |
| `db.query`                                 | internal | D1 `prepare`, `exec`, `batch`                                       | `db.system`, `db.operation.name`, `db.query.text`, `db.rows_read`, `db.rows_written`, `db.batch.size` |
| `kv.get`, `kv.put`, `kv.delete`, `kv.list` | internal | KV bindings                                                         | `db.system` (`kv`), `db.operation.name`                                                               |
| `queue.publish`                            | internal | Queue producer bindings                                             | `messaging.operation.name`, `messaging.batch.message_count`                                           |
| `queue.process`                            | consumer | Each `queues/` batch, under the trace of its first message          | `messaging.destination.name`, `messaging.batch.message_count`                                         |
| `cron`                                     | internal | Each scheduled event                                                | `cron.schedule`, `cron.jobs`                                                                          |
| `cron.run`                                 | internal | Each job that ran, under `cron`                                     | `cron.job`                                                                                            |
| `do.call`                                  | client   | Each Durable Object stub method call                                | `do.binding`, `rpc.method`                                                                            |

Queries made through `tracedFetch` or bindings nest under the span that was active when they ran, so a request trace shows its database work in place.

Server spans record the matched route pattern (`http.route`), never the raw inbound path. A raw path can carry secrets in its parameters, such as `/invite/:token`, and must not reach the trace backend.

## Trace context

- An incoming `traceparent` header continues the caller's trace.
- `tracedFetch` sends the current `traceparent` downstream, so the callee's spans join the same trace. A `traceparent` you set yourself is kept.
- Logs written with `createLogger` carry `traceId` and `spanId`.

## What is not recorded

These are left out on purpose, because they often hold personal or secret data:

- Bound SQL values and the SQL parameters.
- KV keys.
- Queue message bodies.
- Full URLs in outbound calls. Only the host is kept.
- Request and response bodies.

## Use it in your code

```ts
import { createLogger, tracedFetch, withSpan } from "spacefn/trace";

const log = createLogger({ module: "billing" });

export async function charge(orderId: string) {
	return withSpan("billing.charge", async (span) => {
		span.setAttributes({ "order.id": orderId });
		log.info("charging");
		return tracedFetch("https://pay.example.com/charge", { method: "POST" });
	});
}
```

`withSpan` takes `{ attributes, kind, parent }` as its third argument. `setError(message)` marks a span failed without throwing.

## Limits

- No sampling. Every request is exported. Add a sampler before production traffic gets large.
- Durable Object code runs in its own isolate, so its internal queries are not linked to the caller's trace yet. The `do.call` span on the caller side is recorded.
- Logs go to the console only, not to the OTLP endpoint.
- Queue messages carry a `$spacefn` envelope with the trace context. A Worker that is not built with spacefn sees that envelope around the body.
- Export happens once per request, queue batch, or cron dispatch — including when the handler fails, so error spans are exported too. Work outside those, such as a long-running background job, has no flush point.
