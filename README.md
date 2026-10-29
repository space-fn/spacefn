# SpaceFn

SpaceFn is one TypeScript package for building full-stack apps on Cloudflare Workers. File-based conventions, typed SQL, multi-tenancy, observability and hand-rolled auth primitives.

## Packages

| Package          | Purpose                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `spacefn`        | Framework and `space` CLI (`dev`, `build`, `gen`, `deploy`, `db doctor`, `clean`, `doctor`) |
| `create-spacefn` | Scaffold a project                                                                          |

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
app/routes/                 HTTP endpoints
app/pages/                  server-rendered pages with loaders and actions
app/middleware/             numbered middleware
app/queues/                 queue consumers
app/crons/                  scheduled jobs
app/env.ts                  environment schema
app/db/<name>/migrations/   SQL migrations
app/db/<name>/queries/      named, typed SQL queries
app/durable-objects/        Durable Object classes
app/workflows/              Workflow classes
```

## Docs

- [Getting started](docs/getting-started/index.md)
- [Conventions](docs/concepts/conventions.md)
- [Environment](docs/directory-structure/env.md)
- [Tracing](docs/guides/tracing.md)
- [Database](docs/directory-structure/database.md)
- [Tenancy](docs/guides/tenancy.md)
- [Auth](docs/guides/auth.md)
- [Pages](docs/api-reference/pages.md)
- [CLI](docs/api-reference/cli.md)

## Local development

```sh
pnpm install
vp check
vp test run
cd playground && pnpm dev
```
