# Database

Each folder in `app/db/` is a SQLite database: `app/db/main/` is `main`. You write the schema and the queries in SQL; `space gen` turns them into a typed service.

```txt
app/db/main/
  config.json
  migrations/0001_todos.sql
  migrations/0002_due_dates.sql
  queries/list-todos.sql
  queries/add-todo.sql
```

## `config.json`

Each database says how it's reached and when it migrates:

```json [app/db/main/config.json]
{
	"$schema": "../../../node_modules/spacefn/schemas/db.json",
	"driver": "d1",
	"migrateOn": "startup"
}
```

- `driver`: `d1`, `durable-object` or `libsql`; see [Drivers](#drivers). A driver the target doesn't have stops `space gen`.
- `migrateOn`: `startup` applies pending migrations as the app starts. `call` never migrates by itself: your code calls `MainDb.migrate()`, or you run `space db migrate`.

The file is required, so each database's settings are written down, not guessed from the target. `$schema` gives completion and checks in the editor.

## Migrations

`NNNN_name.sql`, run in number order. Each has an `-- up` section and, optionally, a `-- down` section that undoes it:

```sql
-- up
CREATE TABLE todos (
	id INTEGER PRIMARY KEY,
	title TEXT NOT NULL,
	done INTEGER NOT NULL DEFAULT 0
);

-- down
DROP TABLE todos;
```

A migration runs all at once or not at all, so don't write `BEGIN` or `COMMIT`. Applied migrations are recorded with a checksum in a `space_migrations` table, and a migration edited after it ran is refused, so add a new one instead. Files starting with `_` are drafts and are skipped.

With `"migrateOn": "startup"`, a database migrates when the app starts, on every target. To migrate at a time you choose instead, set `"call"` and run them yourself: with `space db migrate` for a libSQL database (below), or from your own code, such as a route behind admin middleware:

```ts [app/routes/admin/migrate.ts]
import { route } from "spacefn";

import MainDb from "#space/db/main.ts";

// POST /admin/migrate, guarded by app/routes/admin/_middleware.ts. Answers the ids it applied.
export default route({ POST: MainDb.migrate() });
```

## Queries

One query per file. The file's name is the function's: `find-todo.sql` (or `find_todo.sql`, or `findTodo.sql`) is `findTodo`. What it returns comes from the statement:

| Statement                                                    | Returns              |
| ------------------------------------------------------------ | -------------------- |
| `SELECT`, `VALUES`, a `WITH` that only reads, or `RETURNING` | `ReadonlyArray<Row>` |
| anything else: `INSERT`, `UPDATE`, `DELETE`, ...             | nothing              |
| any statement, with a `-- :one` line                         | `Option<Row>`        |

`-- :many` and `-- :exec` set the other two the same way, when the statement says otherwise.

```sql [app/db/main/queries/find-todo.sql]
-- :one
-- @param id number
SELECT id, title, done FROM todos WHERE id = :id;
```

- **Parameters** are `:name`. Declare their type with `-- @param name type`, or they're `unknown`.
- **Columns** are typed from the schema. An expression (`count(*) AS n`) needs `-- @column n number`, and a `0`/`1` column becomes a boolean with `-- @column done boolean`.
- **Types:** `string`, `number`, `boolean`, `bytes` (`Uint8Array`) and `unknown`; add `?` for nullable (`string?`).
- **Optional filters:** lines between `-- case` and `-- end` are included only when their `-- when` parameters are given, so one query serves a search form:

```sql [app/db/main/queries/search-todos.sql]
-- @param done boolean
-- @param q string
SELECT id, title, done FROM todos WHERE 1 = 1
-- case
-- when done
AND done = :done
-- when q
AND title LIKE '%' || :q || '%'
-- end
ORDER BY id;
```

A folder in `queries/` groups its queries under its name, as deep as you like:

```txt
app/db/main/queries/
  list-todos.sql          db.listTodos()
  todos/
    mark-done.sql         db.todos.markDone({ id })
    stats/
      count-done.sql      db.todos.stats.countDone()
```

A query and a folder can't share a name (`todos.sql` beside `todos/`). Files and folders starting with `_` are drafts and skipped.

`space gen` checks each query against the migrations and reports a wrong column or table with its file. The VS Code extension shows the same as you type.

## Using a database

Import the generated class and use it as a service:

```ts
import MainDb from "#space/db/main.ts";

const todos = yield * (yield * MainDb).listTodos();
yield * (yield * MainDb).addTodo({ title: "Ship" });
```

Queries fail with Effect's `SqlError`, which says why (a constraint, for example), so you can handle it. A row that doesn't match the generated types is a defect. For SQL that doesn't fit a query file, get Effect's `SqlClient` with `` sql`...` `` templates; the VS Code extension checks those too.

## Drivers

Every driver is SQLite, so the same SQL runs everywhere. Each database names its own in `config.json`, so one app can mix them: `main` on D1 and `rooms` inside Durable Objects, say.

| Driver           | Target     | Where the data is                                                                             |
| ---------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `d1`             | Cloudflare | A D1 database, created on deploy.                                                             |
| `durable-object` | Cloudflare | Inside each Durable Object: `MainDb.layer(durableObjectSql(ctx.storage))` in its constructor. |
| `libsql`         | both       | `DB_<NAME>_URL` (and `DB_<NAME>_AUTH_TOKEN`): Turso, `sqld`, or a `file:`.                    |

On Bun, a libSQL database without a URL is a local file, `.space/data/<name>.db` (or `$SPACE_DATA_DIR/<name>.db`), in WAL mode so the web, queue and cron processes share it. D1 has no transactions, so spacefn runs atomic work there as one batch.

## `space db`

For libSQL databases:

```sh
space db status            # applied, pending, and edited migrations
space db migrate           # apply what's pending
space db rollback --steps 2 --db main
```

It reads `.env`, like the app. D1 and Durable Object databases migrate when the Worker starts.
