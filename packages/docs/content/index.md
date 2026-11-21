# spacefn docs

spacefn builds full-stack TypeScript apps from folders of convention files, on [Effect](https://effect.website). The same app runs on **Cloudflare Workers** or on **Bun** (in Docker). You write routes, pages, SQL and jobs; spacefn generates the wiring into `.space/`, and the `space` CLI runs, builds and deploys it.

Start with [Getting started](getting-started.md), then read what you need:

| Page                                  | What it covers                                                        |
| ------------------------------------- | --------------------------------------------------------------------- |
| [Getting started](getting-started.md) | Create an app, run it, deploy it                                      |
| [Conventions](conventions.md)         | Which folder holds what, and how file names become URLs               |
| [The entry](entry.md)                 | `app/entry.ts`: services, middleware, extra routes, `onError`         |
| [Routes and middleware](routes.md)    | HTTP endpoints, reading input, errors, middleware, CSRF               |
| [Pages](pages.md)                     | Server-rendered pages, form actions, live updates with Datastar       |
| [Database](database.md)               | Migrations, typed SQL queries, drivers, `space db`                    |
| [Services](services.md)               | Kv, Blob, Queue, Bus and RateLimiter, and what backs them per target  |
| [Queues and crons](jobs.md)           | Background jobs and scheduled jobs                                    |
| [Configuration](config.md)            | `configs/vite.ts`, `configs/env.ts`, `.env` files, `configs/infra.ts` |
| [Auth](auth.md)                       | Passwords, sessions, rate limiting, TOTP, signed tokens, OAuth        |
| [Testing](testing.md)                 | Testing pages, routes and queries in memory                           |
| [Deploying](deploy.md)                | Cloudflare, Bun and Docker, stages, telemetry                         |
| [CLI](cli.md)                         | Every `space` command                                                 |

You need to know a little Effect: handlers are `Effect`s, and you get a service with `yield*` inside `Effect.gen`. Effect's own docs cover the rest.

The VS Code extension (`wai-lin.vscode-spacefn`) checks SQL against your migrations, in query files and in `` sql`...` `` templates, and validates Datastar attributes in `` html`...` ``.
