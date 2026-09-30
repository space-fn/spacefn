# @spacefn/db

SQLite-oriented schema definitions, type generation, migrations, and hashing for Kysely projects.

## Install

```bash
pnpm add @spacefn/db kysely
```

## Define schema

```ts
import { column, defineSchema, index } from "@spacefn/db";

export const schema = defineSchema({
	users: {
		id: column.integer().primaryKey().autoIncrement(),
		name: column.text().notNull(),
		email: column.text().unique().notNull(),
		bio: column.text(),
		createdAt: column.text().default("CURRENT_TIMESTAMP"),
		_indexes: [index("idx_users_email", ["email"])],
	},
	posts: {
		id: column.integer().primaryKey().autoIncrement(),
		userId: column.integer().references("users.id").notNull(),
		title: column.text().notNull(),
		body: column.text(),
		_indexes: [index("idx_posts_user", ["userId"])],
	},
});
```

### Column types

| Type               | SQLite      | TypeScript    |
| ------------------ | ----------- | ------------- |
| `column.text()`    | TEXT        | `string`      |
| `column.integer()` | INTEGER     | `number`      |
| `column.real()`    | REAL        | `number`      |
| `column.blob()`    | BLOB        | `ArrayBuffer` |
| `column.json()`    | TEXT (JSON) | `string`      |

### Modifiers

```ts
column
	.text()
	.primaryKey()
	.autoIncrement()
	.notNull()
	.unique()
	.default("value")
	.references("table.column")
	.index({ unique: true });
```

### Indexes

Define indexes on the `_indexes` key:

```ts
import { index } from "@spacefn/db";

const schema = defineSchema({
	users: {
		id: column.integer().primaryKey().autoIncrement(),
		email: column.text().unique().notNull(),
		_indexes: [
			index("idx_users_email", ["email"]),
			index("idx_users_name", ["name"], { unique: true }),
		],
	},
});
```

## Generate types

Generate Kysely-compatible TypeScript types from your schema:

```ts
import { generateTypes } from "@spacefn/db";
import { schema } from "./schema";

const types = generateTypes(schema);
// Write to src/db/types.ts
```

Generates:

```ts
export type Users = {
	id: Generated<number>;
	name: string;
	email: string;
	bio: string | null;
	createdAt: Generated<string>;
};

export type UsersSelect = Selectable<Users>;
export type UsersInsert = Insertable<Users>;
export type UsersUpdate = Updateable<Users>;

export type Database = {
	users: Users;
	posts: Posts;
};
```

## Migrations

### Generate migration

```ts
import { generateMigration, generateMigrationName } from "@spacefn/db";
import { schema } from "./schema";

const name = generateMigrationName("create_users");
const migration = generateMigration(schema, name);
// Write to src/db/migrations/{name}.ts
```

### Run migrations

```ts
import { migrate, migrateDown, migrateStatus } from "@spacefn/db";
import type { Kysely } from "kysely";

// Run pending migrations
await migrate(db, migrations);

// Rollback last migration
await migrateDown(db, migrations);

// Check status
const status = await migrateStatus(db, migrations);
console.log(status.applied, status.pending);
```

Migrations use a `_migrations` table to track applied state.

### Incremental migrations

Generate only the diff between old and new schema:

```ts
import { generateIncrementalMigration } from "@spacefn/db";

const migration = generateIncrementalMigration(oldSchema, newSchema, "add_posts_table");
```

## Schema hashing

Track schema changes with content hashing:

```ts
import { computeSchemaHash, hasSchemaChanged } from "@spacefn/db";

const hash = computeSchemaHash(schemaContent); // 12-char SHA-256
const changed = hasSchemaChanged(root, schemaContent);
```

## Utilities

```ts
import { toCamelCase, toPascalCase } from "@spacefn/db";

toCamelCase("users_table"); // "usersTable"
toPascalCase("users_table"); // "UsersTable"
```
