# spacefn

spacefn is a full-stack framework for Cloudflare Workers. You write files in folders; the framework finds them by name and wires them together. No registry, no config files listing your routes.

## What is spacefn?

spacefn builds on three ideas:

- **Conventions over configuration.** A file in `app/routes/` becomes a route. A file in `app/queues/` becomes a queue. The name and location do the work.
- **Generated code.** Spacefn reads your folders and writes `.space/` — typed helpers for routes, queries, clients, queues, and more. You import from `.space/`.
- **Cloudflare-first.** Everything runs on `workerd`: D1, KV, R2, Durable Objects, Workflows, queues, crons. Deploy anywhere Cloudflare runs.

## How it works (the short version)

1. You write code in `app/`, `modules/`, `utils/`, `lib/`.
2. Spacefn scans those folders and generates `.space/`.
3. Vite serves it in dev; builds it for production.

That's the whole loop. The rest of these docs fills in the details.

## Pick your learning path

- **New to spacefn?** Start with [Getting started](./getting-started/) — create a project and run it in five minutes.
- **Want the big picture?** Read [How it works](./concepts/how-it-works.md).
- **Looking for a specific folder?** Jump to [Directory structure](./directory-structure/).
- **Need an exact signature?** Go to [API reference](./api-reference/).

If something is unclear, [open an issue](https://github.com/TheAnka/space/issues) — these docs are a work in progress.
