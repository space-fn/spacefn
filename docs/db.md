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

## Generate types

```ts
import { generateTypes } from "@spacefn/db";
import { schema } from "./schema";

const types = generateTypes(schema);
// Write to src/db/types.ts
```

Generates Kysely-compatible types:

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

### Generate

```ts
import { generateMigration, generateMigrationName } from "@spacefn/db";

const name = generateMigrationName("create_users");
const migration = generateMigration(schema, name);
// Write to src/db/migrations/{name}.ts
```

### Run

```ts
import { migrate, migrateDown, migrateStatus } from "@spacefn/db";
import type { Kysely } from "kysely";

await migrate(db, migrations);
await migrateDown(db, migrations);
const status = await migrateStatus(db, migrations);
```

### Incremental

Generate only the diff between old and new schema:

```ts
import { generateIncrementalMigration } from "@spacefn/db";

const migration = generateIncrementalMigration(oldSchema, newSchema, "add_posts");
```

## Schema hashing

```ts
import { computeSchemaHash, hasSchemaChanged } from "@spacefn/db";

const hash = computeSchemaHash(schemaContent);
const changed = hasSchemaChanged(root, schemaContent);
```

## Vite plugin

```ts
import { defineConfig } from "vite";
import { generators, dbGenerator } from "@spacefn/vite-plugin";

export default defineConfig({
	plugins: [generators(dbGenerator({ schema: "src/db/schema.ts" }))],
});
```

See [vite-plugin.md](./vite-plugin.md) for generator setup.
