# API reference

Use the import map below to find the public entrypoint for each feature. The
linked page gives signatures or the complete convention, with examples and
limits where they apply.

| Import                    | What it provides                                                      | Documentation                                                                                        |
| ------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `spacefn`                 | Page and HTML helpers from the package entrypoint                     | [Pages](./pages.md), [HTML](./html.md)                                                               |
| `spacefn/runtime`         | Hono, route mounting, env middleware, and queue/cron dispatch helpers | [Runtime API](./runtime.md), [How it works](../concepts/how-it-works.md)                             |
| `spacefn/handler`         | `defineHandler`, default error handling                               | [Handlers](./handlers.md)                                                                            |
| `spacefn/middleware`      | `defineMiddleware`                                                    | [Middleware API](./middleware.md), [convention](../directory-structure/middleware.md)                |
| `spacefn/pages`           | Page definitions, loaders, actions, and HTML helpers                  | [Pages](./pages.md), [HTML](./html.md)                                                               |
| `spacefn/html`            | HTML and CSS helpers                                                  | [HTML](./html.md)                                                                                    |
| `spacefn/env`             | `defineEnv`, field builders, parsing, and request-scoped `env`        | [Environment API](./env.md), [convention](../directory-structure/env.md)                             |
| `spacefn/db`              | Query, migration, inference, and executor APIs                        | [Database API](./database.md), [convention](../directory-structure/database.md)                      |
| `spacefn/auth`            | Password, session, CSRF, rate-limit, TOTP, and token primitives       | [Auth API](./auth.md), [authentication guide](../guides/auth.md)                                     |
| `spacefn/tenancy`         | Tenant lookup, middleware, and lifecycle helpers                      | [Tenancy API](./tenancy.md), [guide](../guides/tenancy.md)                                           |
| `spacefn/trace`           | Spans, logs, fetch instrumentation, binding wrappers, and OTLP export | [Tracing API](./tracing.md), [guide](../guides/tracing.md)                                           |
| `spacefn/http`            | Multipart upload parsing and R2 upload helper                         | [HTTP](./http.md), [file upload example](../examples/file-upload.md)                                 |
| `spacefn/ws`              | WebSocket validation, acceptance, messaging, and broadcast            | [WebSockets](./ws.md), [chat example](../examples/chat-room.md)                                      |
| `spacefn/sse`             | Durable Object SSE fan-out                                            | [Streaming and SSE](./streaming.md), [example](../examples/server-sent-events.md)                    |
| `spacefn/queues`          | Queue consumers, producers, and config helpers                        | [Queues API](./queues.md), [convention](../directory-structure/queues.md)                            |
| `spacefn/crons`           | Scheduled job definitions and trigger helpers                         | [Crons API](./crons.md), [convention](../directory-structure/crons.md)                               |
| `spacefn/durable-objects` | Durable Object config and binding helpers                             | [Durable Objects API](./durable-objects.md), [convention](../directory-structure/durable-objects.md) |
| `spacefn/workflows`       | Workflow config and binding helpers                                   | [Workflows API](./workflows.md), [convention](../directory-structure/workflows.md)                   |
| `spacefn/vite`            | `space()` plugin and client build options                             | [Config](./config.md), [client bundles](../directory-structure/client.md)                            |
| `spacefn/cloudflare`      | `envBindings` helper                                                  | [Config](./config.md), [Environment](../directory-structure/env.md)                                  |
| `spacefn/sync`            | Regenerate convention output programmatically                         | [Generated code](./generated.md)                                                                     |
| `spacefn/testing`         | `testFetch` helper                                                    | [Testing API](./testing.md), [guide](../guides/testing.md)                                           |

## More references

- [Pages](./pages.md) — `definePage`, `defineLoader`, `defineActions`, and `.path()`.
- [HTML](./html.md) — `html`, `raw`, `escapeHtml`, `css`, and `minifyHtml`.
- [Environment](./env.md) — schema types, parsing, and request-scoped values.
- [Database](./database.md) — migration, query, and adapter APIs.
- [Authentication](./auth.md) — credential, session, CSRF, rate-limit, TOTP, and token helpers.
- [Tenancy](./tenancy.md) — tenant resolution and lifecycle APIs.
- [Tracing](./tracing.md) — span, logging, instrumentation, and OTLP APIs.
- [Queues](./queues.md) and [Crons](./crons.md) — event handler and binding APIs.
- [Durable Objects](./durable-objects.md) and [Workflows](./workflows.md) — binding config helpers.
- [Middleware](./middleware.md) and [Testing](./testing.md) — middleware and test helpers.
- [Streaming and SSE](./streaming.md) — Hono route streams and Durable Object SSE fan-out.
- [Config](./config.md) — `cloudflare.config.ts` and `SpaceOptions`.
- [Generated code](./generated.md) — the `.space/` files and import paths.
- [CLI](./cli.md) — scaffold, `space` commands, and dev docs reader.
