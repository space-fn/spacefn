---
title: db/
icon: database
---

# app/db/

One folder per database. Its name is the database's: `app/db/main/` is `main`, imported as `MainDb` from `#space/db/main.ts`. You write the schema and the queries in SQL, and `space gen` turns them into a typed service.

```txt
app/db/
├── main/
│   ├── config.json                how it's reached, and when it migrates
│   ├── migrations/
│   │   ├── 0001_todos.sql         -- up and -- down
│   │   └── 0002_due_dates.sql
│   └── queries/
│       ├── list-todos.sql         MainDb.listTodos()
│       ├── add-todo.sql           MainDb.addTodo({ title })
│       └── todos/
│           └── mark-done.sql      MainDb.todos.markDone({ id })
└── analytics/                     a second database, AnalyticsDb
    └── ...
```

## `config.json`

Required in each database folder:

```json [app/db/main/config.json]
{
	"$schema": "../../../node_modules/spacefn/schemas/db.json",
	"driver": "d1",
	"migrateOn": "startup"
}
```

| Key         | Values                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------- |
| `driver`    | `d1` or `durable-object` (Cloudflare), `libsql` (both targets)                            |
| `migrateOn` | `startup`: pending migrations run as the app starts. `call`: you run them                 |
| `open`      | `startup` (the default): the entry opens it. `manual`: your code does, for one per tenant |

## `migrations/`

`NNNN_name.sql`, applied in number order, each once. An `-- up` section, and optionally a `-- down` that undoes it:

```sql [app/db/main/migrations/0001_todos.sql]
-- up
CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);

-- down
DROP TABLE todos;
```

A migration edited after it ran is refused, so change the schema with a new one.

## `queries/`

One statement per file. The file name is the function's, `find-todo.sql` is `findTodo`, and a folder groups its queries under its name. Comments type what SQL can't say:

```sql [app/db/main/queries/find-todo.sql]
-- :one
-- @param id number
SELECT id, title, done FROM todos WHERE id = :id;
```

`space gen` checks every query against the migrations, and reports a wrong table or column with its file.

## Using it

```ts [modules/todos/todos.ts]
import MainDb from "#space/db/main.ts";

export const list = MainDb.listTodos();
export const add = (title: string) => MainDb.addTodo({ title });
```

Files and folders starting with `_` are drafts, skipped in all three places.

Read more in [Database](../../6-guides/5-database.md).
