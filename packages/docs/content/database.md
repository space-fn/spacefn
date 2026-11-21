# Database

Each folder in `app/db/` is a SQLite database: `app/db/main/` is `main`. You write the schema and the queries in SQL; `space gen` turns them into a typed service.

```txt
app/db/main/
  migrations/0001_todos.sql
  migrations/0002_due_dates.sql
  queries/list-todos.sql
  queries/add-todo.sql
```

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

Databases migrate when the app starts, on every target. On Bun you can also run them yourself with `space db` (below).

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

Every driver is SQLite, so the same SQL runs everywhere. Pick one per database in `configs/space.ts`:

```ts
export default defineSpace({ target: "cloudflare", db: { main: "d1", rooms: "durable-object" } });
```

| Driver           | Target     | Where the data is                                                                              |
| ---------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `d1`             | Cloudflare | A D1 database, created on deploy. The default on Cloudflare.                                   |
| `durable-object` | Cloudflare | Inside each Durable Object: `MainDb.layer(durableObjectSql(ctx.storage))` in its constructor.  |
| `libsql`         | both       | `DB_<NAME>_URL` (and `DB_<NAME>_AUTH_TOKEN`): Turso, `sqld`, or a `file:`. The default on Bun. |

On Bun, a libSQL database without a URL is a local file, `.space/data/<name>.db` (or `$SPACE_DATA_DIR/<name>.db`), in WAL mode so the web, queue and cron processes share it. D1 has no transactions, so spacefn runs atomic work there as one batch.

## `space db`

For libSQL databases:

```sh
space db status            # applied, pending, and edited migrations
space db migrate           # apply what's pending
space db rollback --steps 2 --db main
```

It reads `.env`, like the app. D1 and Durable Object databases migrate when the Worker starts.
