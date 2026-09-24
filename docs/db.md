# @spacefn/db

Schema definitions, SQL diff generation, migration files, generated TypeScript interfaces, and a Vite generator for database projects.

## Install

```bash
pnpm add @spacefn/db
```

```ts
import { column, defineTable } from "@spacefn/db";

export const users = defineTable("users", {
	id: column.serial("id").primaryKey(),
	email: column.text("email").unique().notNull(),
	createdAt: column.timestamp("created_at").notNull(),
});
```

## Generate migrations

```ts
import { generateMigrations } from "@spacefn/db/migrate";

const result = generateMigrations(previousSchema, nextSchema, {
	dialect: "postgres",
});
```

The diff generator reports added/dropped tables and columns, changed nullability, primary-key/unique changes, defaults, and references. Generated SQL is dialect-aware for PostgreSQL, MySQL, and SQLite. Dropping schema objects is destructive; review generated migrations before applying them.

## Vite generator

```ts
import { defineConfig } from "vite";
import { db } from "@spacefn/db/vite";

export default defineConfig(async () => ({
	plugins: [await db({ schema: "src/db/schema.ts" })],
}));
```

The plugin scans schema definitions and migrations and writes generated types and migration indexes to its configured output directory. Its API is asynchronous because schema files are read from disk.
