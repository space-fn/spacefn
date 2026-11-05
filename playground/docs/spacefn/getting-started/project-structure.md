# Project structure

A spacefn project looks like this:

```txt
my-app/
├── app/
│   ├── routes/            HTTP endpoints
│   ├── middleware/        Request middleware
│   ├── queues/            Queue consumers
│   ├── crons/             Scheduled jobs
│   ├── durable-objects/   Durable Object classes
│   ├── workflows/         Workflow classes
│   ├── pages/             Server-rendered pages
│   ├── client/            Browser TS/CSS entries
│   ├── db/                Databases (migrations + queries)
│   └── env.ts             Environment fields
├── modules/               Domain logic (recommended)
├── utils/, lib/           Shared helpers
├── .space/                Generated code (do not edit)
├── docs/                  Project docs (served at /__space_docs/)
├── cloudflare.config.ts   Cloudflare bindings
├── vite.config.ts
└── package.json
```

Each folder in `app/` does one job. Files are found by name, so there is no registry. See [Directory structure](../directory-structure/) for the details of each.

## A feature across folders

A todo page may use several parts of this tree without putting them all in
one folder:

```txt
app/
├── pages/todos.page.ts       markup; GET /todos
├── pages/todos.server.ts     loader and add/toggle/delete actions
├── db/main_db/
│   ├── migrations/           schema changes
│   └── queries/              typed SQL
└── env.ts                    runtime validation schema
modules/
└── todos/                    shared domain rules (optional)
```

The page and its colocated server file make the UI and mutations easy to find.
SQL stays in `app/db/`; reusable business rules can live in `modules/`. See the
[todo board example](../examples/todo-crud.md) for a complete page/action/query
flow.

## Generated files

`.space/` contains generated route registrations, Worker bindings, queue
producers, client helpers, and typed database functions. Read them when
debugging, but do not edit them; change the source files and let `space gen`
or the Vite plugin regenerate them. See [How it works](../concepts/how-it-works.md).
