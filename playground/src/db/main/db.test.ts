import { defineTable, column } from "@spacefn/db";
import type { InferDatabaseType } from "@spacefn/db";
import { describe, it, expect } from "vitest";

describe("playground db schema", () => {
	it("creates users table definition", () => {
		const users = defineTable("users", {
			id: column.id(),
			email: column.string().unique(),
			name: column.string(),
			role: column.enum("admin", "user").default("user"),
			createdAt: column.timestamps().create,
			updatedAt: column.timestamps().update,
		});

		expect(users.name).toBe("users");
		expect(users.columns.id.dataType).toBe("serial");
		expect(users.columns.email.unique).toBe(true);
		expect(users.columns.role.enumValues).toEqual(["admin", "user"]);
		expect(users.columns.createdAt.default).toBe("auto");
	});

	it("creates urls table with foreign key", () => {
		const urls = defineTable("urls", {
			id: column.id(),
			slug: column.string(8).unique(),
			destination: column.text(),
			userId: column.integer().references("users", "id"),
			isActive: column.boolean().default("true"),
			expiresAt: column.timestamp().nullable(),
			createdAt: column.timestamps().create,
			updatedAt: column.timestamps().update,
		});

		expect(urls.columns.slug.length).toBe(8);
		expect(urls.columns.userId.references).toEqual(["users", "id"]);
		expect(urls.columns.expiresAt.nullable).toBe(true);
		expect(urls.columns.isActive.default).toBe("true");
	});

	it("creates clicks table", () => {
		const clicks = defineTable("clicks", {
			id: column.id(),
			urlId: column.integer().references("urls", "id"),
			ip: column.string().nullable(),
			createdAt: column.timestamp().default("now()"),
		});

		expect(clicks.columns.urlId.references).toEqual(["urls", "id"]);
		expect(clicks.columns.ip.nullable).toBe(true);
		expect(clicks.columns.createdAt.default).toBe("now()");
	});

	it("infers database type from schema", () => {
		const schema = {
			users: defineTable("users", {
				id: column.id(),
				email: column.string(),
				role: column.enum("admin", "user"),
			}),
			urls: defineTable("urls", {
				id: column.id(),
				slug: column.string(8),
				userId: column.integer().references("users", "id"),
			}),
		};

		type DB = InferDatabaseType<typeof schema>;
		const _test: DB = {
			users: { id: 1, email: "a@b.com", role: "admin" },
			urls: { id: 1, slug: "abc12345", userId: 1 },
		};
		expect(_test.users.id).toBe(1);
		expect(_test.urls.slug).toBe("abc12345");
	});
});
