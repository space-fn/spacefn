# Conventions

An app is a folder. spacefn reads it (without running your code) and writes the wiring into `.space/`: `space gen` does it once, `space dev` on every change.

```txt
app/routes/           pages and HTTP endpoints      → Pages, Routes
app/db/<name>/        migrations/ and queries/      → Database
app/queues/           one consumer per file         → Queues and crons
app/crons/            one scheduled job per file    → Queues and crons
app/client/           browser scripts and styles    → Pages
app/durable-objects/  Durable Object classes        (Cloudflare only)
app/workflows/        Workflow classes              (Cloudflare only)
app/env.ts            the variables the app reads   → Configuration
app/layers.ts         your own services             → Services
configs/              space.ts, and optional vite.config.ts and infra.ts
lib/ modules/ utils/  your code, imported as @lib/..., @modules/..., @utils/...
.space/               generated
```

Each convention file has one default export, made with a helper: `route(...)`, `page(...)`, `middleware(...)`, `queue(...)`, `cron(...)`. Exporting something else is an error that names the file.

## File names

In `app/routes/`, the path of a file is its URL. Its export decides what it is: a `page(...)` is a server-rendered page, a `route(...)` answers per HTTP method.

| File                 | URL                                         |
| -------------------- | ------------------------------------------- |
| `index.ts`           | `/`                                         |
| `about.ts`           | `/about`                                    |
| `todos/index.ts`     | `/todos`                                    |
| `todos/[id].ts`      | `/todos/:id`, read with `Input.params`      |
| `files/[...path].ts` | `/files/*`, the rest of the path as `path`  |
| `(admin)/users.ts`   | `/users`: a `(group)` folder only organizes |

Parameter names must be identifiers (`[userId]`, not `[user-id]`). Two files for the same URL shape, such as `[id].ts` and `[slug].ts`, are an error.

- **Private files:** a file or folder starting with `_` is never a page, route or job. Use it for helpers next to the code that uses them, like `app/routes/_layout.ts`.
- **Tests:** `*.test.ts` and `*.spec.ts` files are skipped too, so tests sit next to what they test.
- **Dev-only and prod-only files:** `debug.dev.ts` exists only in `space dev`, `banner.prod.ts` only in builds and deploys.
- **Middleware:** `_middleware.ts` in `app/routes/` wraps every request; in a folder below, it wraps that folder's pages and routes. See [Routes](routes.md#middleware).
- **Queues and crons** are named after their file: `app/queues/emails.ts` is the queue `emails`.

## Imports

- `@space/db/<name>.ts` is the generated database for `app/db/<name>/`.
- `@space/assets` gives `head`, the `<script>` and `<link>` tags of `app/client/` (see [Pages](pages.md)).
- `@lib/...`, `@modules/...` and `@utils/...` point at those folders. Change the list with `aliases` in `configs/space.ts`.

Use relative imports with the `.ts` extension inside a folder.
