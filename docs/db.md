# @spacefn/db

Convention-based database layer for Kysely. Schema-as-code with auto-generated types and migrations.

## Design Goals

1. **Single source of truth** — user writes `schema.ts`, everything else is generated
2. **Type-safe** — column builders produce Kysely-compatible TypeScript types
3. **Convention over configuration** — folder structure determines database names and file placement
4. **Multi-dialect** — generate correct SQL for PostgreSQL, MySQL, or SQLite
5. **Zero runtime overhead** — all generation happens at build time via Vite plugin

## Architecture

```
schema.ts (user writes)
    │
    ▼
┌─────────────────────────────────┐
│  @spacefn/db/vite plugin        │
│                                 │
│  1. Import schema module        │
│  2. Extract TableDefinitions    │
│  3. Diff against snapshot       │
│  4. Generate SQL migrations     │
│  5. Generate TypeScript types   │
│  6. Update snapshot             │
└─────────────────────────────────┘
    │
    ├──▶ types.ts         (Kysely Database interface)
    ├──▶ migrations/*.ts  (defineMigration files)
    ├──▶ migrations/index.ts (barrel export)
    └──▶ .schema.json     (snapshot for diffing)
```

## Schema Definition

### Column Builders

The `column` namespace provides 16 type creators with a fluent API:

```ts
import { defineTable, column } from "@spacefn/db";

export const users = defineTable("users", {
	id: column.serial("id").primaryKey(),
	name: column.text("name").notNull(),
	email: column.text("email").unique().notNull(),
	bio: column.text("bio").nullable(),
	role: column.text("role").default("'user'"),
	createdAt: column.timestamp("created_at").default("now()"),
});
```

Each builder returns a `ColumnBuilder` with chainable modifiers:

- `.notNull()` — set NOT NULL constraint
- `.nullable()` — allow NULL
- `.primaryKey()` — set as primary key
- `.unique()` — add unique constraint
- `.default(value)` — set default value expression
- `.references(table, column)` — add foreign key

### Type Inference

```ts
import type { InferDatabaseType, InferRowType, InferColumnType } from "@spacefn/db";

type DB = InferDatabaseType<typeof schema>;
type UserRow = InferRowType<typeof schema.users>;
type UserName = InferColumnType<typeof schema.users.columns.name>;
```

## Migration System

### Snapshot Diffing

The Vite plugin stores a `.schema.json` snapshot of the last-known schema state. On each `schema.ts` change:

1. Load previous snapshot (or start empty)
2. Diff current vs previous using `diffSchemas()`
3. Generate SQL DDL statements per dialect
4. Write migration file with `defineMigration` format
5. Save new snapshot

### Generated Migration

```ts
import { defineMigration } from "@spacefn/db";

export const migration = defineMigration({
	name: "20260923120000_add_email_column",
	up: async (sql) => {
		await sql.exec(`ALTER TABLE "users" ADD COLUMN "email" text NOT NULL UNIQUE;`);
	},
	down: async (sql) => {
		await sql.exec(`ALTER TABLE "users" DROP COLUMN "email";`);
	},
});
```

### Applying Migrations

```ts
import { Migrator } from "kysely/migration";
import { createMigrator } from "@spacefn/db";
import db from "./config";
import { migrations } from "./migrations";

const migrate = createMigrator({ db, migrator: Migrator, migrations });
await migrate();
```

## SQL Dialects

Each dialect maps `ColumnDataType` to database-specific types and uses appropriate identifier quoting and DDL syntax.

### PostgreSQL (default)

- Identifiers: `"name"`
- serial → `serial`
- blob → `bytea`
- ALTER COLUMN TYPE supported

### MySQL

- Identifiers: `` `name` ``
- serial → `int AUTO_INCREMENT PRIMARY KEY`
- boolean → `tinyint`
- uuid → `char(36)`
- ALTER uses `MODIFY COLUMN`

### SQLite

- Identifiers: `"name"`
- serial → `integer PRIMARY KEY AUTOINCREMENT`
- Most types map to `text` or `integer`
- ALTER COLUMN TYPE and ALTER NOT NULL not supported (would need table recreation)

## Limitations

- **SQLite**: `ALTER COLUMN TYPE` and `ALTER COLUMN SET NOT NULL` generate comments instead of SQL — requires manual table recreation
- **Dropped columns**: `down` migration cannot reverse a `DROP COLUMN` without the full column definition (snapshot is lost)
- **First migration**: Initial schema creates all tables; no incremental diff against an empty database
