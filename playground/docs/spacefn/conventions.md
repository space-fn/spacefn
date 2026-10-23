# Folder conventions

Each folder in a spacefn project does one job. Files are found by name, so there is no registry to maintain.

| Folder                                         | Each file is                                     | Generated                                                       | Docs                                       |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------ |
| [`app/routes/`](./routes.md)                   | HTTP endpoints, named exports `GET`, `POST`, ... | Route table                                                     | [routes.md](./routes.md)                   |
| [`app/middleware/`](./middleware.md)           | One middleware, run in name order                | `app.use` calls                                                 | [middleware.md](./middleware.md)           |
| [`app/queues/`](./queues.md)                   | One queue and its consumer                       | Queue binding, consumer trigger, typed producer                 | [queues.md](./queues.md)                   |
| [`app/crons/`](./crons.md)                     | One scheduled job                                | Scheduled trigger                                               | [crons.md](./crons.md)                     |
| [`app/durable-objects/`](./durable-objects.md) | One Durable Object class                         | Class export, binding, config entry                             | [durable-objects.md](./durable-objects.md) |
| [`app/workflows/`](./workflows.md)             | One Workflow class                               | Class export, binding, config entry                             | [workflows.md](./workflows.md)             |
| [`app/env.ts`](./env.md)                       | Environment fields                               | Bindings and types                                              | [env.md](./env.md)                         |
| [`app/db/<name>/`](./database.md)              | Migrations and queries for one database          | Typed query functions and migration runner                      | [database.md](./database.md)               |
| [`app/client/`](./client.md)                   | Browser TS/CSS entries (not `_`-prefixed)        | `.space/client.ts`, `.space/client-manifest.ts`, hashed bundles | [client.md](./client.md)                   |
| [`app/pages/`](./pages.md)                     | Server-rendered pages                            | Route table                                                     | [pages.md](./pages.md)                     |
| [`modules/`](./modules.md)                     | (recommended) domain logic                       | —                                                               | [modules.md](./modules.md)                 |

## Middleware

See [middleware.md](./middleware.md). Files run in name order, `_`-prefixed files are ignored, and middleware runs after tracing and env validation.

## Queues

See [queues.md](./queues.md). The file name is the queue name; consumers and typed producers are generated.

## Crons

See [crons.md](./crons.md). Schedules are read at build time; jobs sharing a schedule run together.

## Bindings and env in jobs

Queue consumers and cron jobs get the same bindings as a request: `env` fields, D1, KV, queue producers and Durable Objects are all traced.

## Modules (recommended)

Business logic that is not a Cloudflare convention lives in `modules/` at the project root. The framework does not scan it; import it from `app/` files.

```
modules/
├── auth/
│   └── users.ts
└── billing/
    └── invoices.ts
```

Keep `app/` for Cloudflare-facing code (routes, queues, crons, durable objects, workflows, db) and `modules/` for domain logic. This keeps the convention folder small and the business logic testable on its own. See [modules.md](./modules.md).
