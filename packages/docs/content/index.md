---
icon: home
---

# Introduction

spacefn builds full-stack TypeScript apps from folders of convention files, on [Effect](https://effect.website). The same app runs on **Cloudflare Workers** or on **Bun** (in Docker). You write routes, pages, SQL and jobs; spacefn generates the wiring into `.space/`, and the `space` CLI runs, builds and deploys it.

Start with [Getting started](1-getting-started.md) and [Conventions](2-conventions.md), then read what you need. [Best practices](3-best-practices.md) says how to keep an app easy to change as it grows.

**Folders.** A page for each folder and file of an app, to browse like a map: [`app/`](4-folders/1-app/index.md) and its [`entry.ts`](4-folders/1-app/1-entry.md), [`routes/`](4-folders/1-app/2-routes.md), [`db/`](4-folders/1-app/3-db.md), [`queues/`](4-folders/1-app/4-queues.md), [`crons/`](4-folders/1-app/5-crons.md), [`client/`](4-folders/1-app/6-client.md), [`durable-objects/`](4-folders/1-app/7-durable-objects.md) and [`workflows/`](4-folders/1-app/8-workflows.md); then [`modules/`](4-folders/2-modules.md), [`lib/`](4-folders/3-lib.md), [`public/`](4-folders/4-public.md), [`docs/`](4-folders/5-docs.md), [`configs/`](4-folders/6-configs.md), [`.space/`](4-folders/7-space.md), [`.env`](4-folders/8-env.md) and [`package.json`](4-folders/9-package-json.md). [See them all](4-folders/index.md).

**Deployment**

| Page                                               | What it covers                                               |
| -------------------------------------------------- | ------------------------------------------------------------ |
| [Deployment](5-deployment/index.md)                | `space deploy`, stages, telemetry                            |
| [Cloudflare](5-deployment/1-cloudflare.md)         | What a deploy creates, domains, local dev                    |
| [Bun](5-deployment/2-bun.md)                       | The processes, the image, servers, more than one machine     |
| [Infrastructure](5-deployment/3-infrastructure.md) | `configs/infra.ts`, `#space/infra.ts`, `variables`, state    |
| [CI/CD](5-deployment/4-ci-cd.md)                   | Cloudflare tokens, GitHub Actions, GitLab CI, preview stages |

**Guides**

| Page                                          | What it covers                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| [The entry](6-guides/1-entry.md)              | `app/entry.ts`: services, middleware, extra routes, `onError`          |
| [Routes and middleware](6-guides/2-routes.md) | HTTP endpoints, reading input, errors, middleware, CSRF                |
| [Pages](6-guides/3-pages.md)                  | Server-rendered pages, form actions, live updates with Datastar        |
| [Frontend](6-guides/4-frontend.md)            | Client entries, `public/`, CSS, framework islands, Datastar components |
| [Database](6-guides/5-database.md)            | Migrations, typed SQL queries, drivers, a database per tenant          |
| [Services](6-guides/6-services.md)            | Kv, Blob, Queue, Bus and RateLimiter, and what backs them per target   |
| [Queues and crons](6-guides/7-jobs.md)        | Background jobs and scheduled jobs                                     |
| [Auth](6-guides/8-auth.md)                    | Passwords, sessions, rate limiting, TOTP, signed tokens, OAuth         |
| [Testing](6-guides/9-testing.md)              | Testing modules, pages and routes in memory                            |

**Reference**

| Page                                          | What it covers                                                        |
| --------------------------------------------- | --------------------------------------------------------------------- |
| [Configuration](7-reference/1-config.md)      | `configs/vite.ts`, `configs/env.ts`, `.env` files, `configs/infra.ts` |
| [CLI](7-reference/2-cli.md)                   | Every `space` command                                                 |
| [Writing docs](7-reference/3-writing-docs.md) | Your app's own `docs/`, in the same reader                            |

**Examples.** Every convention here is shown in full by an app in the repo's `examples/`, tested and shipped with these docs in `node_modules/spacefn-docs/examples/`: the starters, Datastar with Rocket, Tailwind, Lightning CSS, React, Vue, Solid and Svelte islands, and a database per shop.

You need to know a little Effect: handlers are `Effect`s, and you get a service with `yield*` inside `Effect.gen`. Effect's own docs cover the rest.

The VS Code extension (`wai-lin.vscode-spacefn`) checks SQL against your migrations, in query files and in `` sql`...` `` templates, and validates Datastar attributes in `` html`...` ``.
