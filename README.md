# SpaceFn

SpaceFn is one TypeScript package for building full-stack apps on Cloudflare Workers. File-based conventions, typed SQL, multi-tenancy, observability and hand-rolled auth primitives.

## Packages

| Package          | Purpose                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| `spacefn`        | The framework: routes, pages, middleware, env, tracing, SQL, tenancy, auth |
| `space`          | CLI: `dev`, `build`, `gen`, `deploy`, `migrate`                            |
| `create-spacefn` | Scaffold a project                                                         |

## Quick start

```sh
npm create spacefn@latest my-app
cd my-app
pnpm install
pnpm dev
```

Or use the playground in this repo:

```sh
pnpm install
cd playground
pnpm dev
```

## Conventions

A project is a folder of convention files. `spacefn` scans them and generates `.space/`.

```txt
routes/            HTTP endpoints
pages/             server-rendered pages with loaders and actions
middleware/        numbered middleware
queues/            queue consumers
crons/             scheduled jobs
env.ts             environment schema
db/migrations/     SQL migrations
db/queries/        named, typed SQL queries
tenant/            one Durable Object per tenant
```

## Docs

- [Getting started](docs/cloudflare-v2.md)
- [Conventions](docs/conventions.md)
- [Environment](docs/env.md)
- [Tracing](docs/tracing.md)
- [Database](docs/database.md)
- [Tenancy](docs/tenancy.md)
- [Auth](docs/auth.md)
- [Pages](docs/pages.md)
- [CLI](docs/cli.md)

## Local development

```sh
pnpm install
pnpm fmt:check
pnpm lint
cd packages/spacefn && pnpm test
cd playground && pnpm dev
```
