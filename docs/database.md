# Database

SQL stays SQL. You write migrations and queries as `.sql` files. spacefn checks each query against the migrated schema and generates typed functions. No query builder, no ORM.

## Layout

```txt
db/
├── migrations/
│   ├── 0001_create_todos.sql
│   └── 0002_add_owner.sql
└── queries/
    ├── list-todos.sql
    └── find-todo.sql
```

## Migrations

`NNNN_name.sql`, applied in number order. Two files with the same number are an error.

```sql
-- db/migrations/0001_create_todos.sql
CREATE TABLE todos (
	id INTEGER PRIMARY KEY,
	title TEXT NOT NULL,
	done INTEGER NOT NULL DEFAULT 0
);
```

- Each migration runs atomically with its ledger row. A failure leaves nothing behind.
- The ledger is the `space_migrations` table. It stores a checksum of each applied file.
- Editing a migration after it has run is an error. Add a new migration instead.
- The SQL is inlined into `.space/migrations.ts`, so the Worker bundle needs no `.sql` loader.

Apply them with `runMigrations`:

```ts
import { d1Executor, runMigrations } from "spacefn/db";
import { migrations } from "../.space/migrations";

await runMigrations(d1Executor(c.env.DB), migrations);
```

A D1 batch is one transaction, so `d1Executor` is atomic. Durable Object storage uses `transactionSync`, through `durableObjectExecutor`.

## Queries

One query per file. The first line names the function and its mode:

```sql
-- db/queries/find-todo.sql
-- name: findTodo :one
-- @param id number
SELECT id, title, done FROM todos WHERE id = :id;
```

| Mode    | Generated return type |
| ------- | --------------------- |
| `:one`  | `Row \| undefined`    |
| `:many` | `Row[]`               |
| `:exec` | `void` (no rows)      |

Parameters are named (`:id`). Positional `?` is refused, so every value has a name in the generated type. A repeated name is bound once per use.

Generated code (`.space/queries.ts`):

```ts
const row = await findTodo(c.env.DB, { id: 2 }); // FindTodoRow | undefined
```

## How types are found

Each query runs against an in-memory SQLite that has every migration applied. That gives the database's own answer:

| Column kind                         | Type source                 | Nullable when                                            |
| ----------------------------------- | --------------------------- | -------------------------------------------------------- |
| Direct column (`todos.title`)       | Declared type in the schema | Not `NOT NULL`, or on the nullable side of an outer join |
| Expression (`count(*)`, `upper(x)`) | Not reported by SQLite      | Needs `-- @column` (see below)                           |
| Integer primary key                 | `INTEGER`                   | Never                                                    |

Declared types map like SQLite's affinity rules: `INT*` to `number`, `CHAR`/`TEXT`/`CLOB` to `string`, `BLOB` to `Uint8Array`, `REAL` and `NUMERIC` to `number`.

Annotations fill the gaps:

```sql
-- name: countTodos :one
-- @column total number
SELECT count(*) AS total FROM todos;
```

- `-- @column name type` types a result column. Add `?` for nullable: `string?`. Types: `string`, `number`, `boolean`, `bytes`, `unknown`.
- `-- @param name type` types a parameter. Parameters with no annotation take `SqlValue` (`string | number | bigint | Uint8Array | null`).

Errors stop the build with a message that names the query:

- A query that does not match the schema fails with SQLite's own message.
- An expression with no `@column` annotation.
- A result column name used twice. Alias one with `AS`.
- Two query files with the same function name.

## Limits

- A `RIGHT JOIN` or `FULL JOIN` makes every column nullable, because the check is conservative.
- A CTE or subquery column that SQLite cannot trace to a table needs `@column`.
- Parameter types are not inferred from comparisons. Annotate them when they matter.
- One query per file.
- The library does not run migrations for you. Call `runMigrations` yourself, for example once per isolate as the playground does. Two isolates that start together can race on D1, so a deploy step is safer. The `space migrate` command will provide it.

## Tracing

Queries go through the traced binding, so each one is a `db.query` span under the request. The migration run is a `db.migrate` span with the counts of pending and applied migrations.
