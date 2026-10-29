# API reference

Use the import map below to find the public entrypoint for each feature. The
linked page gives signatures or the complete convention, with examples and
limits where they apply.

| Import                    | What it provides                                                      | Documentation                                                             |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `spacefn/runtime`         | Hono, route mounting, env middleware, and queue/cron dispatch helpers | [Runtime API](./runtime.md), [How it works](../concepts/how-it-works.md)  |
| `spacefn/handler`         | `defineHandler`, default error handling                               | [Handlers](./handlers.md)                                                 |
| `spacefn/middleware`      | `defineMiddleware`                                                    | [Middleware](../directory-structure/middleware.md)                        |
| `spacefn/pages`           | Page definitions, loaders, actions, and HTML helpers                  | [Pages](./pages.md), [HTML](./html.md)                                    |
| `spacefn/html`            | HTML and CSS helpers                                                  | [HTML](./html.md)                                                         |
| `spacefn/env`             | `defineEnv`, field builders, and request-scoped `env`                 | [Environment](./env.md)                                                   |
| `spacefn/db`              | Query, migration, and executor APIs                                   | [Database](../directory-structure/database.md)                            |
| `spacefn/auth`            | Password, session, CSRF, rate-limit, TOTP, and token primitives       | [Auth](../guides/auth.md)                                                 |
| `spacefn/tenancy`         | Tenant lookup and lifecycle helpers                                   | [Tenancy](../guides/tenancy.md)                                           |
| `spacefn/trace`           | Spans, logs, fetch instrumentation, and OTLP export                   | [Tracing](../guides/tracing.md)                                           |
| `spacefn/http`            | Multipart upload parsing and R2 upload helper                         | [HTTP](./http.md), [file upload example](../examples/file-upload.md)      |
| `spacefn/ws`              | WebSocket validation, acceptance, messaging, and broadcast            | [WebSockets](./ws.md), [chat example](../examples/chat-room.md)           |
| `spacefn/queues`          | Queue definitions, producers, and config helpers                      | [Queues](../directory-structure/queues.md)                                |
| `spacefn/crons`           | Cron definitions and schedule config                                  | [Crons](../directory-structure/crons.md)                                  |
| `spacefn/durable-objects` | Durable Object config and binding helpers                             | [Durable Objects](../directory-structure/durable-objects.md)              |
| `spacefn/workflows`       | Workflow binding and config helpers                                   | [Workflows](../directory-structure/workflows.md)                          |
| `spacefn/vite`            | `space()` plugin and client build options                             | [Config](./config.md), [client bundles](../directory-structure/client.md) |
| `spacefn/cloudflare`      | `envBindings` helper                                                  | [Config](./config.md), [Environment](../directory-structure/env.md)       |
| `spacefn/sync`            | Regenerate convention output programmatically                         | [Generated code](./generated.md)                                          |
| `spacefn/testing`         | `testFetch` helper                                                    | [Testing](../guides/testing.md)                                           |

## More references

- [Pages](./pages.md) — `definePage`, `defineLoader`, `defineActions`, and `.path()`.
- [HTML](./html.md) — `html`, `raw`, `escapeHtml`, `css`, and `minifyHtml`.
- [Environment](./env.md) — `defineEnv` and field builders.
- [Config](./config.md) — `cloudflare.config.ts` and `SpaceOptions`.
- [Generated code](./generated.md) — the `.space/` files and import paths.
- [CLI](./cli.md) — scaffold, `space` commands, and dev docs reader.
