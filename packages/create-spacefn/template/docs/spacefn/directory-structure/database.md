# Database

SQL stays SQL. You write migrations and queries as `.sql` files. spacefn checks each query against the migrated schema and generates typed functions. No query builder, no ORM.

## Layout

```txt
app/db/
├── main_db/
│   ├── config.ts
│   ├── migrations/
│   │   ├── 0001_create_todos.sql
│   │   └── 0002_add_owner.sql
│   └── queries/
│       ├── list-todos.sql
│       └── find-todo.sql
└── analytics_db/
    ├── config.ts
    ├── migrations/
    └── queries/
```

`config.ts` is optional and picks the dialect, `sqlite` by default:

```ts
import { defineDatabase } from "spacefn/db";

export default defineDatabase({ dialect: "sqlite" });
```

`space gen` writes one generated module per database: `.space/db/<name>.ts`. It holds the migrations, `migrated`, `migrate`, and one typed function per query file. Import it as `@space/db/<name>`.

## Binding

The `db/` folder generates the query module, but it does **not** declare the Cloudflare binding. Declare the D1 binding yourself in `cloudflare.config.ts` so `c.env.DB` (and `bindings.d.ts`) are typed:

```ts
import { defineConfig, bindings } from "cf/config";

export default defineConfig({
	worker: {
		entrypoint: "./app/entry.ts",
		name: "my-app",
		compatibilityDate: "2026-10-19",
		env: {
			DB: bindings.d1({ name: "my-app-db" }),
		},
	},
});
```

The key (`DB`) is the binding name you read as `c.env.DB`. `name` is the D1 database name. Add `database_id` (via `id`) once the database exists in production.

## Migrations

`NNNN_name.sql`, applied in number order. Two files with the same number are an error.

A migration has an `-- up` section and may have a `-- down` section. A file with no `-- up` is refused:

```sql
-- app/db/main_db/migrations/0001_create_todos.sql
-- up
CREATE TABLE todos (
	id INTEGER PRIMARY KEY,
	title TEXT NOT NULL,
	done INTEGER NOT NULL DEFAULT 0
);

-- down
DROP TABLE todos;
```

- Each migration runs atomically with its ledger row. A failure leaves nothing behind.
- The ledger is the `space_migrations` table. It stores a checksum of each applied file.
- Editing a migration after it has run is an error. Add a new migration instead.
- Transaction statements (`BEGIN`, `COMMIT`, `ROLLBACK`, `END`) are refused: each statement runs in the runner's own transaction.
- The SQL is inlined into the generated module, so the Worker bundle needs no `.sql` loader.

### Applying and rolling back

The generated `migrated(db)` applies what is missing and caches the result per database object. Call it before queries that need the schema, once per isolate. A failed run is retried on the next call:

```ts
import { migrated } from "@space/db/main_db";

await migrated(c.env.DB);
```

To drive migrations yourself, use the generated `migrate`, or `runMigrations` when you want the traced variant:

```ts
import { migrate, migrations } from "@space/db/main_db";
import { d1Executor } from "spacefn/db";

await migrate(d1Executor(c.env.DB)); // apply what is missing
await migrate(d1Executor(c.env.DB), "down", 1); // roll back one step
```

- Rolling back goes newest first and stops after one step unless you pass a count.
- A rollback refuses to run when a step has no `-- down` section, or when its file changed after it was applied. The schema and the ledger never disagree partway.
- A D1 batch is one transaction, so `d1Executor` is atomic. Durable Object storage uses `transactionSync`, through `durableObjectExecutor`.

## Queries

One query per file. The first line names the function and its mode:

```sql
-- app/db/main_db/queries/find-todo.sql
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

Generated code (`.space/db/<name>.ts`):

```ts
const row = await findTodo(d1Executor(c.env.DB), { id: 2 }); // FindTodoRow | undefined
```

### What the generated TypeScript looks like

For `find-todo.sql` (`:one`), spacefn writes:

```ts
export interface FindTodoRow {
	id: number;
	title: string;
	done: number;
}

/** SELECT id, title, done FROM todos WHERE id = :id; */
export async function findTodo(
	db: DbReader,
	params: { id: number },
): Promise<FindTodoRow | undefined> {
	return (
		await db.query<FindTodoRow>("SELECT id, title, done FROM todos WHERE id = ?", [params.id])
	)[0];
}
```

- Modes: `:one` → `Row | undefined`, `:many` → `Row[]`, `:exec` → `void` (no `Row` interface).
- Parameters with no `@param` annotation take `SqlValue` (`string | number | bigint | Uint8Array | null`). With no parameters at all, the type is `Record<string, never>` and you pass `{}`.
- A repeated parameter name is bound once per use, in placeholder order.
- The SQL text is in a doc comment above the function.

For a dynamic query (`getProducts` above), only the fragments whose parameters are defined get assembled:

```ts
export async function getProducts(
	db: DbReader,
	params: { tag?: string; minPrice?: number; maxPrice?: number },
): Promise<GetProductsRow[]> {
	const __sql: string[] = [];
	const __values: unknown[] = [];
	__sql.push("SELECT id, slug, name, thumbnail_img\nFROM products\nWHERE deleted_at IS NULL\n");
	if (params.tag !== undefined) {
		__sql.push("\nAND tag = ?\n");
		__values.push(params.tag!);
	}
	// ... minPrice, maxPrice ...
	__sql.push("\nORDER BY name;\n");
	return db.query<GetProductsRow>(__sql.join(""), __values);
}
```

Parameters used only inside conditional fragments become optional (`?`), and parameters that are undefined drop their fragment. The all-fragments-excluded SQL is validated against the schema at build time.

`DbReader` is `{ query<T>(sql: string, params?: unknown[]): Promise<T[]> }`. Any executor that satisfies it works, including `durableObjectExecutor` for a Durable Object's SQLite storage.

## How types are found

Each query runs against an in-memory database for the configured dialect, with every migration applied. SQLite uses `node:sqlite`; PostgreSQL uses PGlite. This gives the database's own answer:

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

## Dynamic queries

Optional fragments use `-- case`, `-- when <params>` and `-- end`. Fragments are independent: each is included when all of its listed parameters are defined. The result column set must stay the same across all combinations.

```sql
-- name: getProducts :many
-- @param tag string
-- @param minPrice number
-- @param maxPrice number
SELECT id, slug, name, thumbnail_img
FROM products
WHERE deleted_at IS NULL
-- case
-- when tag
AND tag = :tag
-- when minPrice
AND price >= :minPrice
-- when maxPrice
AND price <= :maxPrice
-- end
ORDER BY name;
```

Parameters used only in conditional fragments become optional in the generated function, and the SQL is assembled at run time.

## Executors and dialects

Spacefn is not tied to D1. The generated query functions take a `DbReader` (`{ query<T>(sql, params?) }`), and migrations take a `MigrationExecutor`. Plug in whichever client matches your database.

### Dialects

Set the dialect in `app/db/<name>/config.ts`:

```ts
import { defineDatabase } from "spacefn/db";

export default defineDatabase({ dialect: "sqlite" }); // or "postgres"
```

- `sqlite` (default) — inferred against an in-memory SQLite.
- `postgres` — inferred against PGlite. Type inference differs (for example `SERIAL`); `@column` annotations still apply.

The PostgreSQL validation engine is an optional dependency. Install
`@electric-sql/pglite` in the app when using `dialect: "postgres"`.

### Runtime adapters

| Backend               | Executor                                   | Use when                                |
| --------------------- | ------------------------------------------ | --------------------------------------- |
| Cloudflare D1         | `d1Executor(c.env.DB)`                     | Default. D1 `batch` is one transaction. |
| Turso / libSQL        | `libsqlExecutor(client)`                   | `@libsql/client/web` client.            |
| Durable Object SQLite | `durableObjectExecutor(this.ctx.storage)`  | Per-tenant or per-object storage.       |
| Any other client      | Implement `DbReader` + `MigrationExecutor` | Postgres, Neon, Hyperdrive, etc.        |

```ts
import { createClient } from "@libsql/client/web";
import { libsqlExecutor } from "spacefn/db";

const client = createClient({ url: env.TURSO_URL, authToken: env.TURSO_TOKEN });
const rows = await listTodos(libsqlExecutor(client), {});
```

For a Postgres (or any non-built-in) client, implement the two interfaces:

```ts
import type { DbReader, MigrationExecutor } from "spacefn/db";

const pg: DbReader & MigrationExecutor = {
	query: async (sql, params) => (await pool.query(sql, params)).rows,
	transaction: async (statements) => {
		/* run in one transaction */
	},
};
```

`dialect` selects the scratch database used to validate query SQL. The optional
`driver` field is accepted by `defineDatabase` but currently does not select or
configure a runtime adapter. The built-in runtime executors are D1, Durable
Object SQLite, and libSQL; there is no built-in PostgreSQL executor. Generated
query functions use `?` placeholders, so a PostgreSQL `DbReader` must translate
them to the driver's placeholder syntax. Test your custom adapter against your
actual database before relying on generated query validation.

### Multi-database

Each subdirectory of `app/db/` becomes its own module: `@space/db/<name>`. A project can mix backends freely — D1 for the shared data, a Durable Object per tenant, Turso for analytics.

## Limits

- A `RIGHT JOIN` or `FULL JOIN` makes every column nullable, because the check is conservative.
- A CTE or subquery column that SQLite cannot trace to a table needs `@column`.
- Parameter types are not inferred from comparisons. Annotate them when they matter.
- One query per file.
- Migrations are not applied automatically. Call the generated `migrated(db)` for D1, or `migrate(executor)` with the matching executor. Two isolates that start together can race to apply D1 migrations, so applying them in a controlled deploy step is safer. The CLI has `space db doctor` for validation, but no `space migrate` command.

## Tracing

Queries go through the traced binding, so each one is a `db.query` span under the request. The migration run is a `db.migrate` span with the counts of pending and applied migrations.
