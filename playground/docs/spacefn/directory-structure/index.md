# Directory structure

Every folder in `app/` does one job. The framework finds files by name, so there is no registry to maintain.

| Folder                 | What it holds                         | Docs                                    |
| ---------------------- | ------------------------------------- | --------------------------------------- |
| `app/routes/`          | HTTP endpoints                        | [routes](./routes.md)                   |
| `app/middleware/`      | Request middleware, run in name order | [middleware](./middleware.md)           |
| `app/queues/`          | Queue consumers                       | [queues](./queues.md)                   |
| `app/crons/`           | Scheduled jobs                        | [crons](./crons.md)                     |
| `app/durable-objects/` | Durable Object classes                | [durable-objects](./durable-objects.md) |
| `app/workflows/`       | Workflow classes                      | [workflows](./workflows.md)             |
| `app/pages/`           | Server-rendered pages                 | [pages](./pages.md)                     |
| `app/client/`          | Browser TS/CSS entries                | [client](./client.md)                   |
| `app/db/<name>/`       | Migrations and queries                | [database](./database.md)               |
| `app/env.ts`           | Environment fields                    | [env](./env.md)                         |
| `modules/`             | Domain logic (recommended)            | [modules](./modules.md)                 |

Files starting with `_` are ignored in every folder. See [Conventions](../concepts/conventions.md) for why.
