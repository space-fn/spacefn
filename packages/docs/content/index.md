# spacefn docs

spacefn builds full-stack TypeScript apps from folders of convention files, on [Effect](https://effect.website). The same app runs on **Cloudflare Workers** or on **Bun** (in Docker). You write routes, pages, SQL and jobs; spacefn generates the wiring into `.space/`, and the `space` CLI runs, builds and deploys it.

Start with [Getting started](1-getting-started.md) and [Conventions](2-conventions.md), then read what you need.

**Guides**

| Page                                          | What it covers                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| [The entry](3-guides/1-entry.md)              | `app/entry.ts`: services, middleware, extra routes, `onError`          |
| [Routes and middleware](3-guides/2-routes.md) | HTTP endpoints, reading input, errors, middleware, CSRF                |
| [Pages](3-guides/3-pages.md)                  | Server-rendered pages, form actions, live updates with Datastar        |
| [Frontend](3-guides/4-frontend.md)            | Client entries, `public/`, CSS, framework islands, Datastar components |
| [Database](3-guides/5-database.md)            | Migrations, typed SQL queries, drivers, a database per tenant          |
| [Services](3-guides/6-services.md)            | Kv, Blob, Queue, Bus and RateLimiter, and what backs them per target   |
| [Queues and crons](3-guides/7-jobs.md)        | Background jobs and scheduled jobs                                     |
| [Auth](3-guides/8-auth.md)                    | Passwords, sessions, rate limiting, TOTP, signed tokens, OAuth         |
| [Testing](3-guides/9-testing.md)              | Testing modules, pages and routes in memory                            |

**Deploying and reference**

| Page                                          | What it covers                                                        |
| --------------------------------------------- | --------------------------------------------------------------------- |
| [Deploying](4-deploy.md)                      | Cloudflare, Bun and Docker, stages, telemetry                         |
| [Configuration](5-reference/1-config.md)      | `configs/vite.ts`, `configs/env.ts`, `.env` files, `configs/infra.ts` |
| [CLI](5-reference/2-cli.md)                   | Every `space` command                                                 |
| [Writing docs](5-reference/3-writing-docs.md) | Your app's own `docs/`, in the same reader                            |

**Examples.** Every convention here is shown in full by an app in the repo's `examples/`, tested and shipped with these docs in `node_modules/spacefn-docs/examples/`: the starters, Datastar with Rocket, Tailwind, Lightning CSS, React, Vue, Solid and Svelte islands, and a database per shop.

You need to know a little Effect: handlers are `Effect`s, and you get a service with `yield*` inside `Effect.gen`. Effect's own docs cover the rest.

The VS Code extension (`wai-lin.vscode-spacefn`) checks SQL against your migrations, in query files and in `` sql`...` `` templates, and validates Datastar attributes in `` html`...` ``.
