# @spacefn/db

Convention-based database layer for [Kysely](https://kysely.dev/). Define schemas with type-safe column builders, auto-generate TypeScript types, and manage migrations — all from a single `schema.ts` file.

## Install

```bash
pnpm add @spacefn/db kysely
```

## Quick Start

```ts
// src/db/main/schema.ts
import { defineTable, column } from "@spacefn/db";

export const users = defineTable("users", {
	id: column.serial("id").primaryKey(),
	name: column.text("name").notNull(),
	email: column.text("email").unique().notNull(),
	bio: column.text("bio").nullable(),
	createdAt: column.timestamp("created_at").default("now()"),
});

export const posts = defineTable("posts", {
	id: column.serial("id").primaryKey(),
	userId: column.integer("user_id").references("users", "id").notNull(),
	title: column.text("title").notNull(),
	body: column.text("body").notNull(),
});
```

Add the Vite plugin to generate types and migrations:

```ts
// vite.config.ts
import { db } from "@spacefn/db/vite";

export default {
	plugins: [db({ dialect: "postgres" })],
};
```

The plugin generates:

- `src/db/main/types.ts` — Kysely `Database` interface
- `src/db/main/migrations/*.ts` — migration files on schema change
- `src/db/main/migrations/index.ts` — migration barrel export

## API

### `defineTable(name, columns)`

Define a table schema.

```ts
import { defineTable, column } from "@spacefn/db";

const users = defineTable("users", {
	id: column.serial("id").primaryKey(),
	name: column.text("name").notNull(),
});
```

### `column` namespace

16 type-safe column creators with fluent modifiers:

| Creator                                  | SQL Type               | Notes                  |
| ---------------------------------------- | ---------------------- | ---------------------- |
| `column.serial(name)`                    | serial / autoincrement | Primary key by default |
| `column.integer(name)`                   | integer                |                        |
| `column.bigint(name)`                    | bigint                 |                        |
| `column.text(name)`                      | text                   |                        |
| `column.varchar(name, length)`           | varchar(n)             |                        |
| `column.boolean(name)`                   | boolean                |                        |
| `column.timestamp(name)`                 | timestamp              |                        |
| `column.date(name)`                      | date                   |                        |
| `column.time(name)`                      | time                   |                        |
| `column.decimal(name, precision, scale)` | decimal(p,s)           |                        |
| `column.real(name)`                      | real                   |                        |
| `column.double(name)`                    | double precision       |                        |
| `column.json(name)`                      | json                   |                        |
| `column.jsonb(name)`                     | jsonb                  | PostgreSQL only        |
| `column.uuid(name)`                      | uuid                   |                        |
| `column.blob(name)`                      | blob / bytea           |                        |

**Fluent modifiers:**

```ts
column.text("name").notNull(); // NOT NULL
column.text("bio").nullable(); // nullable
column.text("email").unique(); // UNIQUE constraint
column.text("name").default("''"); // DEFAULT value
column.integer("user_id").references("users", "id"); // FOREIGN KEY
column.serial("id").primaryKey(); // PRIMARY KEY
```

### `createMigrator(config)`

Create a migrator function wrapping Kysely's Migrator.

```ts
import { Migrator } from "kysely/migration";
import { createMigrator } from "@spacefn/db";
import db from "../config";
import { migrations } from "./migrations";

const migrate = createMigrator({
	db,
	migrator: Migrator,
	migrations,
});

await migrate(); // run up
await migrate({ direction: "down" }); // rollback
```

### `defineMigration(definition)`

Define a single migration.

```ts
import { defineMigration } from "@spacefn/db";

export const migration = defineMigration({
	name: "001_create_users",
	up: async (sql) => {
		await sql.exec(`CREATE TABLE "users" (...)`);
	},
	down: async (sql) => {
		await sql.exec(`DROP TABLE "users"`);
	},
});
```

## Type Inference

Infer Kysely-compatible types from your schema:

```ts
import type { InferDatabaseType } from "@spacefn/db";
import { users, posts } from "./schema";

const schema = { users, posts };
type DB = InferDatabaseType<typeof schema>;
// { users: { id: Generated<number>, name: string, ... }, posts: { ... } }
```

## Vite Plugin

```ts
// vite.config.ts
import { db } from "@spacefn/db/vite";

export default {
	plugins: [
		db({
			dialect: "postgres", // "postgres" | "mysql" | "sqlite"
		}),
	],
};
```

### Conventions

Place database files in `src/db/<name>/`:

```
src/db/
  main/
    config.ts       # Kysely instance (user writes)
    schema.ts       # Table definitions (user writes)
    types.ts        # Auto-generated Database interface
    migrations/
      index.ts      # Auto-generated barrel
      001_create_users.ts  # Auto-generated on schema change
```

### How it works

1. Plugin scans `src/db/*/` for `config.ts` + `schema.ts`
2. On `schema.ts` change, diffs against `.schema.json` snapshot
3. Generates migration file with SQL DDL
4. Regenerates `types.ts` and `migrations/index.ts`

### Dialects

| Feature           | Postgres  | MySQL                | SQLite                              |
| ----------------- | --------- | -------------------- | ----------------------------------- |
| serial            | `serial`  | `int AUTO_INCREMENT` | `integer PRIMARY KEY AUTOINCREMENT` |
| boolean           | `boolean` | `tinyint`            | `integer`                           |
| blob              | `bytea`   | `blob`               | `blob`                              |
| identifier quotes | `"id"`    | `` `id` ``           | `"id"`                              |
| ALTER COLUMN TYPE | ✅        | ✅ MODIFY COLUMN     | ❌ (recreate table)                 |
| ALTER NOT NULL    | ✅        | ✅ MODIFY COLUMN     | ❌ (recreate table)                 |

## License

Apache-2.0
