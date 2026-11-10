# Project structure

A spacefn project looks like this:

```txt
my-app/
├── app/                   Setup: how Cloudflare reaches your code
│   ├── routes/            HTTP endpoints
│   ├── middleware/        Request middleware
│   ├── queues/            Queue consumers
│   ├── crons/             Scheduled jobs
│   ├── durable-objects/   Durable Object classes
│   ├── workflows/         Workflow classes
│   ├── pages/             Server-rendered pages
│   ├── client/            Browser TS/CSS entries
│   ├── db/                Databases (migrations, queries, connect helpers)
│   ├── env.ts             Environment fields
│   └── entry.ts           App creation and error mapping
├── modules/               Your features: rules, use cases, fragments
├── utils/                 Small pure helpers
├── lib/                   Clients for third-party services
├── .space/                Generated code (do not edit)
├── docs/                  Project docs (served at /__space_docs/)
├── cloudflare.config.ts   Cloudflare bindings
├── vite.config.ts
└── package.json
```

Each folder in `app/` does one job, and files are found by name, so there is no registry. See [Directory structure](../directory-structure/) for each one.

`app/` holds setup only. A file there reads its input, calls a function from `modules/`, and returns the result. Everything that decides what your app does lives in `modules/`, `utils/`, and `lib/`, which never read the request or the environment; they receive what they need as arguments. See [modules, utils, and lib](../directory-structure/modules.md).

## A feature across folders

A todo board touches several folders. The setup files stay small, and the feature itself lives in one module:

```txt
app/
├── pages/todos.page.ts       page shell; GET /todos
├── pages/todos.server.ts     loader and actions: read the form, call the module
├── db/main_db/
│   ├── migrations/           schema changes
│   └── queries/              typed SQL
└── db/main_db.ts             connect helper: migrate, return the executor
modules/
└── todos/
    ├── index.ts              public surface
    ├── todos.ts              rules: titles, toggling, deleting
    ├── views.ts              the list fragment actions re-send
    └── todos.test.ts         unit tests, no Worker needed
utils/
└── errors.ts                 AppError, mapped to HTTP in app/entry.ts
```

See the [todo board example](../examples/todo-crud.md) for the complete flow.

## Generated files

`.space/` contains generated route registrations, Worker bindings, queue
producers, client helpers, and typed database functions. Read them when
debugging, but do not edit them; change the source files and let `space gen`
or the Vite plugin regenerate them. See [How it works](../concepts/how-it-works.md).
