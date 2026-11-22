---
icon: folders
---

# Folders

A spacefn app is a folder, and where a file sits says what it is. This section has a page for each folder and file of an app: what goes in it, how its files are named, and an example. Browse it like a map of the app.

```txt
my-app/
├── app/                     what spacefn reads: wiring only
│   ├── entry.ts             the services, what wraps every request, onError
│   ├── routes/              pages and HTTP endpoints, by URL
│   ├── db/                  one folder per database: SQL migrations and queries
│   ├── queues/              one consumer per queue
│   ├── crons/               one scheduled job per file
│   ├── assets/              browser entries, bundled by Vite
│   ├── durable-objects/     Durable Object classes (Cloudflare)
│   └── workflows/           Workflow classes (Cloudflare)
├── modules/                 one folder per feature: logic, views, client code, tests
├── lib/                     what features share: UI kit, helpers, services
├── public/                  files served as they are at /
├── docs/                    notes on this app, in the docs reader
├── configs/                 Vite, Vitest, TypeScript, env and infra settings
├── .space/                  generated from app/; never edited
├── .env                     local variables; .env.<stage> for deploys
└── package.json             scripts, dependencies and #imports
```

| Folder or file                                       | What it is                                       |
| ---------------------------------------------------- | ------------------------------------------------ |
| [`app/`](1-app/index.md)                             | What spacefn reads, and nothing else             |
| [`app/entry.ts`](1-app/1-entry.md)                   | The app: services, `before`, `routes`, `onError` |
| [`app/routes/`](1-app/2-routes.md)                   | A file per URL: pages, routes, `_middleware.ts`  |
| [`app/db/`](1-app/3-db.md)                           | Databases: config, migrations and typed queries  |
| [`app/queues/`](1-app/4-queues.md)                   | Queue consumers                                  |
| [`app/crons/`](1-app/5-crons.md)                     | Scheduled jobs                                   |
| [`app/assets/`](1-app/6-assets.md)                   | Scripts and stylesheets for the browser          |
| [`app/durable-objects/`](1-app/7-durable-objects.md) | Durable Objects, on Cloudflare                   |
| [`app/workflows/`](1-app/8-workflows.md)             | Workflows, on Cloudflare                         |
| [`modules/`](2-modules.md)                           | The app's features                               |
| [`lib/`](3-lib.md)                                   | Code the features share                          |
| [`public/`](4-public.md)                             | Static files at fixed URLs                       |
| [`docs/`](5-docs.md)                                 | The app's own docs                               |
| [`configs/`](6-configs.md)                           | Tool settings, env and infra                     |
| [`.space/`](7-space.md)                              | Generated code                                   |
| [`.env`](8-env.md)                                   | Variables for dev and for each deploy stage      |
| [`package.json`](9-package-json.md)                  | Scripts, dependencies, `#` imports               |

Only `app/` has rules spacefn checks. `modules/` and `lib/` are the layout the docs, the new app and the examples use, so every kind of code has one place to look; see [Best practices](../3-best-practices.md).
