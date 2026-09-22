import { describe, it, expect } from "vitest";

import { defineTable, column, defineMigration } from "../src/index.js";
import type { InferDatabaseType } from "../src/index.js";

// --- defineTable -------------------------------------------------------------

describe("defineTable", () => {
	it("creates a table definition", () => {
		const users = defineTable("users", {
			id: column.serial("id").primaryKey(),
			name: column.text("name").notNull(),
			email: column.text("email").unique().notNull(),
		});

		expect(users.name).toBe("users");
		expect(users.columns.id.dataType).toBe("serial");
		expect(users.columns.id.primaryKey).toBe(true);
		expect(users.columns.name.dataType).toBe("text");
		expect(users.columns.name.nullable).toBe(false);
		expect(users.columns.email.unique).toBe(true);
	});

	it("supports nullable columns", () => {
		const users = defineTable("users", {
			bio: column.text("bio").nullable(),
		});

		expect(users.columns.bio.nullable).toBe(true);
	});

	it("supports default values", () => {
		const posts = defineTable("posts", {
			createdAt: column.timestamp("created_at").default("now()"),
		});

		expect(posts.columns.createdAt.default).toBe("now()");
	});

	it("supports varchar with length", () => {
		const users = defineTable("users", {
			name: column.varchar("name", 255),
		});

		expect(users.columns.name.typeArgs).toEqual([255]);
	});

	it("supports decimal with precision and scale", () => {
		const prices = defineTable("prices", {
			amount: column.decimal("amount", 10, 2),
		});

		expect(prices.columns.amount.typeArgs).toEqual([10, 2]);
	});

	it("supports foreign key references", () => {
		const posts = defineTable("posts", {
			userId: column.integer("user_id").references("users", "id"),
		});

		expect(posts.columns.userId.references).toEqual({ table: "users", column: "id" });
	});
});

// --- defineMigration ---------------------------------------------------------

describe("defineMigration", () => {
	it("creates a migration definition", () => {
		const migration = defineMigration({
			name: "001_create_users",
			up: async (sql) => {
				await sql.exec("CREATE TABLE users (id SERIAL PRIMARY KEY)");
			},
			down: async (sql) => {
				await sql.exec("DROP TABLE users");
			},
		});

		expect(migration.name).toBe("001_create_users");
		expect(typeof migration.up).toBe("function");
		expect(typeof migration.down).toBe("function");
	});
});

// --- InferDatabaseType -------------------------------------------------------

describe("InferDatabaseType", () => {
	it("infers types from schema", () => {
		const schema = {
			users: defineTable("users", {
				id: column.serial("id").primaryKey(),
				name: column.text("name").notNull(),
				email: column.text("email").unique().notNull(),
				bio: column.text("bio").nullable(),
				createdAt: column.timestamp("created_at").default("now()"),
			}),
		};

		// Type-level test: InferDatabaseType should produce correct types
		type _DB = InferDatabaseType<typeof schema>;

		// Runtime verification that schema is valid
		expect(schema.users.name).toBe("users");
		expect(Object.keys(schema.users.columns)).toHaveLength(5);
	});
});

// --- column helpers ----------------------------------------------------------

describe("column helpers", () => {
	it("creates all column types", () => {
		const table = defineTable("test", {
			a: column.serial("a"),
			b: column.integer("b"),
			c: column.bigint("c"),
			d: column.text("d"),
			e: column.varchar("e", 100),
			f: column.boolean("f"),
			g: column.timestamp("g"),
			h: column.date("h"),
			i: column.time("i"),
			j: column.decimal("j", 8, 2),
			k: column.real("k"),
			l: column.double("l"),
			m: column.json("m"),
			n: column.jsonb("n"),
			o: column.uuid("o"),
			p: column.blob("p"),
		});

		expect(Object.keys(table.columns)).toHaveLength(16);
	});
});
