# spacefn

spacefn is a full-stack framework for Cloudflare Workers. You write files in folders; the framework finds them by name and wires them together. No registry, no config files listing your routes.

## What is spacefn?

spacefn is a full-stack framework for Cloudflare Workers. You write files in folders; the framework finds them by name and wires them together. No registry, no config files listing your routes.

spacefn is not a new runtime or a new language. It is an opinionated convention layer on top of tools you already know:

- **Vite** serves and bundles the app in dev and production.
- **Hono** is the HTTP router underneath `app/routes/` and `app/pages/`.
- **Cloudflare `workerd`** runs the Worker, with D1, KV, R2, Durable Objects, Workflows, queues and crons.
- **TypeScript** is the only language. Generated code in `.space/` is plain TypeScript you can read and import.

What spacefn actually does is the wiring work: it scans `app/`, generates typed helpers, merges bindings into the Cloudflare config, and mounts everything in `app/entry.ts`. You still write ordinary TypeScript against ordinary libraries. The payoff is that the project stays organized by folder, and adding a route, a queue, or a Durable Object is just adding a file. Everything is extensible: the generated code is plain TypeScript, the config is a normal `cloudflare.config.ts`, and you can add bindings, middleware, or whole libraries on top without fighting the framework.

spacefn builds on three ideas:

- **Conventions over configuration.** A file in `app/routes/` becomes a route. A file in `app/queues/` becomes a queue. The name and location do the work.
- **Generated code.** Spacefn reads your folders and writes `.space/` - typed helpers for routes, queries, clients, queues, and more. You import from `.space/`.
- **Cloudflare-first.** Everything runs on `workerd`: D1, KV, R2, Durable Objects, Workflows, queues, crons. Deploy anywhere Cloudflare runs.

## How it works (the short version)

1. You write code in `app/`. Spacefn scans `app/` and generates `.space/`.
2. Keep shared logic in `modules/`, `utils/`, `lib/` and import it from `app/`. Spacefn does not scan those folders.
3. Vite serves it in dev; builds it for production.

That's the whole loop. The rest of these docs fills in the details.

## Pick your learning path

- **New to spacefn?** Start with [Getting started](./getting-started/) - create a project and run it in five minutes.
- **Want the big picture?** Read [How it works](./concepts/how-it-works.md).
- **Looking for a specific folder?** Jump to [Directory structure](./directory-structure/).
- **Need an exact signature?** Go to [API reference](./api-reference/).

If something is unclear, [open an issue](https://github.com/TheAnka/space/issues) - these docs are a work in progress.
