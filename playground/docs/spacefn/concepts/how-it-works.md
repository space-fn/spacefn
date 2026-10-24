# How it works

Spacefn has three moving parts: conventions, codegen, and the build.

## Conventions

You put files in folders. Spacefn reads the folders and wires them up. A file at `app/routes/todos.ts` becomes a route. A file at `app/queues/emails.ts` becomes a queue. The name and location are the config.

Files starting with `_` are ignored. That's the only naming rule.

## Codegen

Spacefn scans your folders and writes `.space/`. That folder holds typed helpers: `routes.ts`, `queues.ts`, `client.ts`, `db/*`, and more. You import from `.space/` and from `spacefn/*`.

`.space/` is generated. Don't edit it; it's regenerated on every dev start and build.

## Dev vs build

- **Dev.** Vite serves your app on `workerd`. Codegen runs first, then the dev server starts. Client files are served unhashed and transformed on request.
- **Build.** Vite bundles the worker and the client. Client files get content-hashed names in `_client/`. The output is a Cloudflare Worker bundle.

## What runs where

- Server code (`app/`, `modules/`) runs on `workerd`.
- Client code (`app/client/`) runs in the browser, bundled separately.
- `.space/` is shared: server imports it, and some parts (like `client.ts`) are browser-facing.

## Next steps

- [Conventions](./conventions.md) — why the folder layout matters.
- [Directory structure](../directory-structure/) — each folder in detail.
