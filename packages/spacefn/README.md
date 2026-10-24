# spacefn

All-in-one framework for Cloudflare Workers. File-based conventions, full
observability (OTLP), hand-rolled auth primitives, multi-database support.

## Install

```bash
# Scaffold a new app (recommended)
pnpm create spacefn my-app

# Or add to an existing project
pnpm add spacefn hono cf
pnpm add -D @cloudflare/vite-plugin
```

`hono`, `cf` and `@cloudflare/vite-plugin` are app-owned dependencies. The
template pins them; you can bump them directly for security patches without
waiting for a `spacefn` release. The `space` CLI binary ships with the
`spacefn` package.

## Quickstart

```bash
pnpm create spacefn my-app
cd my-app
pnpm install
pnpm dev          # `vp dev` under the hood
```

## Subpath exports

Import from the subpath that owns the thing you need. There is no root
barrel export.

| Subpath                                         | Purpose                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `spacefn/handler`                               | `defineHandler`                                                                   |
| `spacefn/middleware`                            | `defineMiddleware`                                                                |
| `spacefn/pages` / `spacefn/html`                | `definePage`, `defineLoader`, `defineActions`, `html`, `raw`, `css`, `minifyHtml` |
| `spacefn/runtime`                               | request context, env                                                              |
| `spacefn/cloudflare`                            | `defineSpace`, `compatibilityDate`, bindings/exports/triggers                     |
| `spacefn/env`                                   | `defineEnv`, field helpers                                                        |
| `spacefn/db`                                    | `d1Executor`, migration helpers                                                   |
| `spacefn/auth`                                  | password hashing, sessions, CSRF, TOTP                                            |
| `spacefn/tenancy`                               | multi-tenant DO helpers                                                           |
| `spacefn/queues` / `spacefn/crons`              | queue/cron definitions                                                            |
| `spacefn/durable-objects` / `spacefn/workflows` | DO/workflow helpers                                                               |
| `spacefn/trace`                                 | OTLP tracing                                                                      |
| `spacefn/sync`                                  | codegen entry point                                                               |
| `spacefn/vite`                                  | Vite plugin                                                                       |
| `spacefn/testing`                               | test helpers                                                                      |
| `spacefn/cli`                                   | `space` CLI (internal)                                                            |

## Conventions

- `app/` is the only supported layout. `.space/` is generated at the project root.
- `app/routes/` — file-based HTTP routes (`index.ts`, `[id].ts`).
- `app/pages/` — server-rendered pages.
- `app/db/<name>/` — per-database migrations + typed queries.
- `app/durable-objects/`, `app/workflows/` — scanned and exported.
- `app/middleware/`, `app/queues/`, `app/crons/` — scanned.
- `modules/`, `utils/`, `lib/` — business logic (not scanned).

## Path aliases (template)

`@space/*`, `@app/*`, `@modules/*`, `@utils/*`, `@lib/*`.

## Docs

Full docs live in `docs/spacefn/` (bundled in `create-spacefn`). In dev mode,
visit `/__space_docs` to browse them rendered.

## License

Apache-2.0
