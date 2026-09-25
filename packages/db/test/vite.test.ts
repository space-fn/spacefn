import { describe, it, expect } from "vitest";

import { defineTable, column } from "../src/index.js";
import type { DatabaseSchema } from "../src/types.js";
import { diffSchemas } from "../src/vite/differ.js";
import { generateTypesCode, generateMigrationIndex } from "../src/vite/generator.js";
import {
	generateCreateTable,
	generateAddColumn,
	generateDropColumn,
	generateDropTable,
	generateAlterColumnType,
	generateAlterColumnNullability,
	generateAlterColumnDefault,
} from "../src/vite/sql.js";

// --- Schema Differ -----------------------------------------------------------

describe("diffSchemas", () => {
	it("detects new tables", () => {
		const before: DatabaseSchema = {};
		const after: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
				},
			},
		};

		const changes = diffSchemas(before, after);
		expect(changes).toHaveLength(1);
		expect(changes[0].type).toBe("table_added");
	});

	it("detects dropped tables", () => {
		const before: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
				},
			},
		};
		const after: DatabaseSchema = {};

		const changes = diffSchemas(before, after);
		expect(changes).toHaveLength(1);
		expect(changes[0].type).toBe("table_dropped");
	});

	it("detects added columns", () => {
		const before: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
				},
			},
		};
		const after: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
					email: { dataType: "varchar", nullable: false, unique: false },
				},
			},
		};

		const changes = diffSchemas(before, after);
		expect(changes).toHaveLength(1);
		expect(changes[0].type).toBe("column_added");
	});

	it("detects dropped columns", () => {
		const before: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
					email: { dataType: "varchar", nullable: false, unique: false },
				},
			},
		};
		const after: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
				},
			},
		};

		const changes = diffSchemas(before, after);
		expect(changes).toHaveLength(1);
		expect(changes[0].type).toBe("column_dropped");
	});

	it("detects column type changes", () => {
		const before: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
					name: { dataType: "varchar", nullable: false, unique: false },
				},
			},
		};
		const after: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
					name: { dataType: "text", nullable: false, unique: false },
				},
			},
		};

		const changes = diffSchemas(before, after);
		expect(changes).toHaveLength(1);
		expect(changes[0].type).toBe("column_changed");
	});

	it("detects nullability changes", () => {
		const before: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
					bio: { dataType: "text", nullable: false, unique: false },
				},
			},
		};
		const after: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
					bio: { dataType: "text", nullable: true, unique: false },
				},
			},
		};

		const changes = diffSchemas(before, after);
		expect(changes).toHaveLength(1);
		expect(changes[0].type).toBe("column_changed");
	});

	it("returns empty for identical schemas", () => {
		const schema: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { dataType: "serial", nullable: false, unique: false },
					name: { dataType: "varchar", nullable: false, unique: false },
				},
			},
		};

		const changes = diffSchemas(schema, schema);
		expect(changes).toHaveLength(0);
	});
});

// --- SQL Generation (PostgreSQL) ---------------------------------------------

describe("generateCreateTable", () => {
	it("generates CREATE TABLE for postgres", () => {
		const table = defineTable("users", {
			id: column.id(),
			name: column.string(),
			email: column.string().unique(),
		});

		const sql = generateCreateTable(table, "postgres");
		expect(sql).toContain('CREATE TABLE "users"');
		expect(sql).toContain('"id" SERIAL');
		expect(sql).toContain('"name" VARCHAR(255) NOT NULL');
		expect(sql).toContain('"email" VARCHAR(255) NOT NULL UNIQUE');
	});

	it("includes FOREIGN KEY constraints", () => {
		const table = defineTable("posts", {
			id: column.id(),
			userId: column.integer().references("users", "id"),
		});

		const sql = generateCreateTable(table, "postgres");
		expect(sql).toContain('FOREIGN KEY ("userId") REFERENCES "users"("id")');
	});

	it("includes CHECK constraints for enums", () => {
		const table = defineTable("users", {
			role: column.enum("admin", "user"),
		});

		const sql = generateCreateTable(table, "postgres");
		expect(sql).toContain("CHECK");
		expect(sql).toContain("'admin'");
		expect(sql).toContain("'user'");
	});

	it("handles nullable columns", () => {
		const table = defineTable("users", {
			bio: column.text().nullable(),
		});

		const sql = generateCreateTable(table, "postgres");
		expect(sql).toContain('"bio" TEXT');
		expect(sql).not.toContain('"bio" TEXT NOT NULL');
	});
});

describe("generateAddColumn", () => {
	it("generates ALTER TABLE ADD COLUMN", () => {
		const col = column.string();
		const sql = generateAddColumn("users", "email", col.toJSON(), "postgres");
		expect(sql).toBe('ALTER TABLE "users" ADD COLUMN "email" VARCHAR(255) NOT NULL');
	});
});

describe("generateDropColumn", () => {
	it("generates ALTER TABLE DROP COLUMN", () => {
		const sql = generateDropColumn("users", "email", "postgres");
		expect(sql).toBe('ALTER TABLE "users" DROP COLUMN "email"');
	});
});

describe("generateDropTable", () => {
	it("generates DROP TABLE", () => {
		const sql = generateDropTable("users", "postgres");
		expect(sql).toBe('DROP TABLE "users"');
	});
});

describe("generateAlterColumnType", () => {
	it("generates ALTER COLUMN TYPE", () => {
		const col = column.text();
		const sql = generateAlterColumnType("users", "name", col.toJSON(), "postgres");
		expect(sql).toBe('ALTER TABLE "users" ALTER COLUMN "name" TYPE TEXT');
	});
});

describe("generateAlterColumnNullability", () => {
	it("generates SET NOT NULL", () => {
		const col = column.string();
		const sql = generateAlterColumnNullability("users", "name", col.toJSON(), "postgres");
		expect(sql).toBe('ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL');
	});

	it("generates DROP NOT NULL", () => {
		const col = column.string().nullable();
		const sql = generateAlterColumnNullability("users", "name", col.toJSON(), "postgres");
		expect(sql).toBe('ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL');
	});
});

describe("generateAlterColumnDefault", () => {
	it("generates SET DEFAULT", () => {
		const col = column.string().default("'hello'");
		const sql = generateAlterColumnDefault("users", "name", col.toJSON(), "postgres");
		expect(sql).toBe('ALTER TABLE "users" ALTER COLUMN "name" SET DEFAULT \'hello\'');
	});

	it("generates DROP DEFAULT", () => {
		const col = column.string();
		const sql = generateAlterColumnDefault("users", "name", col.toJSON(), "postgres");
		expect(sql).toBe('ALTER TABLE "users" ALTER COLUMN "name" DROP DEFAULT');
	});
});

// --- Dialect-specific SQL Generation -----------------------------------------

describe("MySQL dialect", () => {
	it("uses backtick quoting", () => {
		const table = defineTable("users", {
			id: column.id(),
			name: column.string(),
		});

		const sql = generateCreateTable(table, "mysql");
		expect(sql).toContain("`users`");
		expect(sql).toContain("`id`");
		expect(sql).toContain("AUTO_INCREMENT");
	});

	it("uses DATETIME for timestamps", () => {
		const table = defineTable("events", {
			createdAt: column.timestamps().create,
		});

		const sql = generateCreateTable(table, "mysql");
		expect(sql).toContain("DATETIME");
	});
});

describe("SQLite dialect", () => {
	it("uses double-quote quoting", () => {
		const table = defineTable("users", {
			id: column.id(),
			name: column.string(),
		});

		const sql = generateCreateTable(table, "sqlite");
		expect(sql).toContain('"users"');
	});

	it("uses INTEGER for booleans", () => {
		const table = defineTable("flags", {
			active: column.boolean(),
		});

		const sql = generateCreateTable(table, "sqlite");
		expect(sql).toContain("INTEGER");
	});
});

// --- Types Code Generation ---------------------------------------------------

describe("generateTypesCode", () => {
	it("generates TypeScript types from schema", () => {
		const tables = {
			users: defineTable("users", {
				id: column.id(),
				email: column.string(),
				name: column.string().nullable(),
			}),
		};

		const code = generateTypesCode(tables);
		expect(code).toContain("export type UsersRow = {");
		expect(code).toContain("id: Generated<number>");
		expect(code).toContain("email: string");
		expect(code).toContain("name: string | null");
		expect(code).toContain("export interface Database {");
		expect(code).toContain("users: UsersRow");
	});

	it("handles enum types", () => {
		const tables = {
			users: defineTable("users", {
				role: column.enum("admin", "user"),
			}),
		};

		const code = generateTypesCode(tables);
		expect(code).toContain('"admin" | "user"');
	});

	it("handles timestamps", () => {
		const tables = {
			users: defineTable("users", {
				createdAt: column.timestamps().create,
			}),
		};

		const code = generateTypesCode(tables);
		expect(code).toContain("createdAt: Generated<TimestampColumnType>");
	});
});

// --- Migration Index Generation ----------------------------------------------

describe("generateMigrationIndex", () => {
	it("generates barrel file from migration files", () => {
		const files = [
			"/path/to/migrations/20240315120000_initial.ts",
			"/path/to/migrations/20240316140000_add_clicks.ts",
		];

		const code = generateMigrationIndex(files, "postgres");
		expect(code).toContain("import * as m_20240315120000_initial from");
		expect(code).toContain("import * as m_20240316140000_add_clicks from");
		expect(code).toContain('"20240315120000_initial": m_20240315120000_initial');
		expect(code).toContain('"20240316140000_add_clicks": m_20240316140000_add_clicks');
		expect(code).toContain("export function createMigrator(db: any)");
	});
});
