# Database API (`spacefn/db`)

This module provides migration runners and adapters, D1 query helpers, and the
build-time APIs used to validate and infer typed SQL. The folder conventions
and generated query usage are in the [database guide](../directory-structure/database.md).

## Database configuration

```ts
import { defineDatabase } from "spacefn/db";

export default defineDatabase({ dialect: "sqlite", driver: "d1" });
```

`defineDatabase(config?)` returns the config with `dialect` defaulting to
`"sqlite"`. `DatabaseConfig` accepts `dialect?: "sqlite" | "postgres"` and
`driver?: "d1" | "libsql"`. This is metadata for generation; it does not open a
database connection.

## Migrations

```ts
import { d1Executor, runMigrations, scanMigrations } from "spacefn/db";

const migrations = await scanMigrations("app/db/main/migrations");
const applied = await runMigrations(d1Executor(env.DB), migrations);
```

`scanMigrations(dir)` reads numbered `NNNN_name.sql` files with `-- up` and
optional `-- down` sections, sorted by number. `applyMigrations(db, migrations)`
applies pending migrations; `runMigrations` does the same inside a tracing span.
Both return the IDs applied during that call. `rollbackMigrations(db, migrations,
{ steps? })` rolls back one migration by default, newest first. It verifies all
selected migrations have unchanged checksums and `down` SQL before running any
rollback. Applied migrations are immutable: create a new migration instead of
editing an applied one.

`Migration` is `{ id: string; sql: string; down?: string }`.
`MigrationExecutor` supplies `query<T>(sql, params?)` and
`transaction(statements)`. A `MigrationStatement` is SQL text or
`{ sql, params? }`. The migration ledger table name is exported as `LEDGER`
(`"space_migrations"`); invalid migration work throws `MigrationError`.

| Adapter               | API                              | Notes                                                                                                 |
| --------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| D1                    | `d1Executor(db)`                 | Uses D1 `batch` for atomic migration statements.                                                      |
| Durable Object SQLite | `durableObjectExecutor(storage)` | Uses `transactionSync`; `DurableStorageLike` includes `sql.exec`, `transactionSync`, and `deleteAll`. |
| LibSQL                | `libsqlExecutor(client)`         | Accepts the `LibSqlClientLike` shape used by `@libsql/client/web`.                                    |

`D1Database` aliases the Workers D1 type. `SqlStorageLike` and
`DurableStorageLike` describe the Durable Object SQLite adapter surface;
`LibSqlClientLike` describes the LibSQL client's `execute` and `batch` methods.

`checksum(sql)` returns a SHA-256 hex checksum. `splitStatements(script)` splits
SQL while preserving quoted text, comments, and trigger bodies; transaction
control statements are rejected because each migration is transaction-wrapped.
`generateMigrationsSource(migrations)` creates the `.space` migration module.

## Query helpers

`queryD1<T>(db, sql, values)` runs a prepared D1 query and returns its rows.
`D1Reader` describes the small `prepare().bind().all()` surface it needs;
`SqlValue` is `string | number | bigint | Uint8Array | null`. `DbReader` is the
generic `{ query<T>(sql, params?): Promise<T[]> }` interface used by readers.

The build-time SQL helpers are also exported:

| API                                         | Purpose                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `parseQueryFile(file, text)`                | Parses one annotated SQL query file.                                                                                                 |
| `analyzeQueries(dir, migrations, dialect?)` | Validates query files against a scratch schema and infers result columns.                                                            |
| `scratchDatabase(migrations, dialect?)`     | Creates the in-memory SQLite or PostgreSQL schema used for inference. PostgreSQL inference requires optional `@electric-sql/pglite`. |
| `scanMigrations(dir)`                       | Loads and validates numbered migration files.                                                                                        |

`Dialect` is `"sqlite" | "postgres"`. Prefer the generated functions under
`@space/db/<name>` in application code; these helpers are primarily useful to
customize build and migration tooling.
