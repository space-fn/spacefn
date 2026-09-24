# @spacefn/db

Convention-based schema and migration helpers for Kysely projects.

## Install

```bash
pnpm add @spacefn/db kysely
```

## Define tables

```ts
import { column, defineTable } from "@spacefn/db";

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
});
```

`serial()` is an auto-incrementing type; call `.primaryKey()` explicitly when required. Modifiers include `notNull`, `nullable`, `unique`, `default`, and `references`.

## Type inference

```ts
import type { InferDatabaseType } from "@spacefn/db";
import { posts, users } from "./schema";

type Database = InferDatabaseType<{ users: typeof users; posts: typeof posts }>;
```

## Migrations

Use `defineMigration` for explicit migration files and `createMigrator` to run them through Kysely's migrator. The generated Vite plugin also creates migration SQL when a schema snapshot changes.

```ts
import { defineMigration } from "@spacefn/db";

export const migration = defineMigration({
	name: "001_create_users",
	up: async (sql) => sql.exec('CREATE TABLE "users" (...)'),
	down: async (sql) => sql.exec('DROP TABLE "users"'),
});
```

## Vite plugin

```ts
import { defineConfig } from "vite";
import { db } from "@spacefn/db/vite";

export default defineConfig(async () => ({
	plugins: [await db({ dialect: "postgres" })],
}));
```

The plugin scans `src/db/<name>/schema.ts` and `migrations/*.ts`, writes `types.ts` and `migrations/index.ts`, and supports `postgres`, `mysql`, and `sqlite`. Its factory is asynchronous because it scans the project before creating generators.

See [database documentation](../../docs/db.md).
