import { describe, it, expect } from "vitest";

import { defineTable, column } from "../src/index.js";
import type { InferDatabaseType } from "../src/index.js";

// --- defineTable -------------------------------------------------------------

describe("defineTable", () => {
	it("creates a table definition", () => {
		const users = defineTable("users", {
			id: column.id(),
			name: column.string(),
			email: column.string().unique(),
		});

		expect(users.name).toBe("users");
		expect(users.columns.id.dataType).toBe("serial");
		expect(users.columns.id.default).toBe("auto");
		expect(users.columns.name.dataType).toBe("varchar");
		expect(users.columns.name.nullable).toBe(false);
		expect(users.columns.email.unique).toBe(true);
	});

	it("supports nullable columns", () => {
		const users = defineTable("users", {
			bio: column.text().nullable(),
		});

		expect(users.columns.bio.nullable).toBe(true);
	});

	it("supports default values", () => {
		const posts = defineTable("posts", {
			role: column.enum("admin", "user").default("user"),
		});

		expect(posts.columns.role.default).toBe("user");
		expect(posts.columns.role.enumValues).toEqual(["admin", "user"]);
	});

	it("supports varchar with length", () => {
		const users = defineTable("users", {
			slug: column.string(8),
		});

		expect(users.columns.slug.length).toBe(8);
	});

	it("supports foreign key references", () => {
		const posts = defineTable("posts", {
			userId: column.integer().references("users", "id"),
		});

		expect(posts.columns.userId.references).toEqual(["users", "id"]);
	});

	it("supports timestamps helper", () => {
		const users = defineTable("users", {
			createdAt: column.timestamps().create,
			updatedAt: column.timestamps().update,
		});

		expect(users.columns.createdAt.dataType).toBe("timestamp");
		expect(users.columns.createdAt.default).toBe("auto");
		expect(users.columns.updatedAt.dataType).toBe("timestamp");
		expect(users.columns.updatedAt.default).toBe("auto");
	});

	it("serializes to JSON", () => {
		const users = defineTable("users", {
			id: column.id(),
			name: column.string().nullable(),
		});

		const json = JSON.parse(JSON.stringify(users));
		expect(json.name).toBe("users");
		expect(json.columns.id.dataType).toBe("serial");
		expect(json.columns.name.nullable).toBe(true);
	});
});

// --- column helpers ----------------------------------------------------------

describe("column helpers", () => {
	it("id() creates serial with auto default", () => {
		const col = column.id();
		const json = col.toJSON();
		expect(json.dataType).toBe("serial");
		expect(json.default).toBe("auto");
	});

	it("string() creates varchar(255) by default", () => {
		const col = column.string();
		const json = col.toJSON();
		expect(json.dataType).toBe("varchar");
		expect(json.length).toBeUndefined();
	});

	it("string(n) creates varchar(n)", () => {
		const col = column.string(100);
		const json = col.toJSON();
		expect(json.length).toBe(100);
	});

	it("text() creates text", () => {
		const col = column.text();
		expect(col.toJSON().dataType).toBe("text");
	});

	it("integer() creates integer", () => {
		const col = column.integer();
		expect(col.toJSON().dataType).toBe("integer");
	});

	it("boolean() creates boolean", () => {
		const col = column.boolean();
		expect(col.toJSON().dataType).toBe("boolean");
	});

	it("timestamp() creates timestamp", () => {
		const col = column.timestamp();
		expect(col.toJSON().dataType).toBe("timestamp");
	});

	it("json() creates json", () => {
		const col = column.json();
		expect(col.toJSON().dataType).toBe("json");
	});

	it("enum() creates enum with values", () => {
		const col = column.enum("a", "b", "c");
		const json = col.toJSON();
		expect(json.dataType).toBe("enum");
		expect(json.enumValues).toEqual(["a", "b", "c"]);
	});

	it("modifiers chain correctly", () => {
		const col = column.string().nullable().unique().default("'hello'");
		const json = col.toJSON();
		expect(json.nullable).toBe(true);
		expect(json.unique).toBe(true);
		expect(json.default).toBe("'hello'");
	});

	it("references() stores foreign key", () => {
		const col = column.integer().references("users", "id");
		const json = col.toJSON();
		expect(json.references).toEqual(["users", "id"]);
	});
});

// --- InferDatabaseType -------------------------------------------------------

describe("InferDatabaseType", () => {
	it("infers types from schema", () => {
		const schema = {
			users: defineTable("users", {
				id: column.id(),
				email: column.string(),
				name: column.string().nullable(),
				active: column.boolean(),
			}),
		};

		type DB = InferDatabaseType<typeof schema>;
		// Type test: DB.users should have the right shape
		const _test: DB = {
			users: {
				id: 1,
				email: "test@example.com",
				name: null,
				active: true,
			},
		};
		expect(_test.users.id).toBe(1);
	});
});
