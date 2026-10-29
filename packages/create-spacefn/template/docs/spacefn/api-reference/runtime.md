# Runtime (`spacefn/runtime`)

Most applications use the generated `@space/worker` helpers rather than calling
these low-level runtime functions directly. This subpath is useful when you
mount a route, page, or Worker handler yourself.

## Hono and routes

`Hono` is re-exported from Hono. `mountRoute(app, path, module)` registers the
named HTTP method handlers from a route module:

```ts
import { Hono, mountRoute } from "spacefn/runtime";

const app = new Hono();
mountRoute(app, "/health", {
	GET: (c) => c.json({ ok: true }),
});
```

A route module can export `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and
`OPTIONS`. It must export at least one supported method. See [route
conventions](../directory-structure/routes.md) for automatic discovery.

## Environment and tracing middleware

`envMiddleware(schema)` validates bindings and makes the typed `env` export from
`spacefn/env` readable inside each request. The generated worker installs it
when `createApp({ env: schema })` is used. Do not install a second copy unless
you are assembling the Hono app yourself.

`traceConfig()`, `traceRequest()`, and `traceBindings()` are lower-level tracing
helpers. Normal apps configure tracing through `OTLP_*` fields in `app/env.ts`;
see the [tracing guide](../guides/tracing.md).

## Worker event dispatch

`dispatchQueue(batch, env, ctx, handlers)` and
`dispatchScheduled(event, env, ctx, jobs)` run registered queue and cron
handlers. The generated `@space/worker` uses these for Cloudflare `queue` and
`scheduled` events. Prefer the generated wiring so its handler map stays in
sync with `app/queues/` and `app/crons/`.

`runWithBindings(env, fn)` runs async work with its Cloudflare bindings in the
framework's async context. Generated request and queue producers establish this
context automatically; call it directly only when implementing a custom Worker
entrypoint.

`mountPage(app, path, page, server?, options?)` registers one server-rendered
page. The generator calls it for each discovered `*.page.ts`; see the [pages
API](./pages.md).
