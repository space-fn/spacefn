---
icon: compass
---

# Guides

How to build each part of an app, with the code in `modules/` and `lib/` and the `app/` files that wire it. Read them in order the first time; each stands alone after that.

| Guide                                | What it covers                                                         |
| ------------------------------------ | ---------------------------------------------------------------------- |
| [The entry](1-entry.md)              | `app/entry.ts`: services, middleware, extra routes, `onError`          |
| [Routes and middleware](2-routes.md) | HTTP endpoints, reading input, errors, middleware, CSRF                |
| [Pages](3-pages.md)                  | Server-rendered pages, form actions, live updates with Datastar        |
| [Frontend](4-frontend.md)            | Client entries, `public/`, CSS, framework islands, Datastar components |
| [Database](5-database.md)            | Migrations, typed SQL queries, drivers, a database per tenant          |
| [Services](6-services.md)            | Kv, Blob, Queue, Bus and RateLimiter, and what backs them per target   |
| [Queues and crons](7-jobs.md)        | Background jobs and scheduled jobs                                     |
| [Auth](8-auth.md)                    | Passwords, sessions, rate limiting, TOTP, signed tokens, OAuth         |
| [Testing](9-testing.md)              | Testing modules, pages and routes in memory                            |

Each guide's code is taken from an app in `examples/`, which ships with these docs in `node_modules/spacefn-docs/examples/`.
