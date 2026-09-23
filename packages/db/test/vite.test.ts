import { describe, it, expect } from "vitest";

import type { DatabaseSchema } from "../src/types.js";
import { diffSchemas } from "../src/vite/differ.js";
import {
	generateCreateTable,
	generateAddColumn,
	generateDropColumn,
	generateDropTable,
	generateAlterColumnType,
} from "../src/vite/sql.js";

// --- Schema Differ -----------------------------------------------------------

describe("diffSchemas", () => {
	it("detects new tables", () => {
		const before: DatabaseSchema = {};
		const after: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { name: "id", dataType: "serial", nullable: false, primaryKey: true, unique: false },
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
					id: { name: "id", dataType: "serial", nullable: false, primaryKey: true, unique: false },
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
					id: { name: "id", dataType: "serial", nullable: false, primaryKey: true, unique: false },
				},
			},
		};
		const after: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { name: "id", dataType: "serial", nullable: false, primaryKey: true, unique: false },
					email: {
						name: "email",
						dataType: "text",
						nullable: false,
						primaryKey: false,
						unique: true,
					},
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
					id: { name: "id", dataType: "serial", nullable: false, primaryKey: true, unique: false },
					email: {
						name: "email",
						dataType: "text",
						nullable: false,
						primaryKey: false,
						unique: true,
					},
				},
			},
		};
		const after: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					id: { name: "id", dataType: "serial", nullable: false, primaryKey: true, unique: false },
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
					name: {
						name: "name",
						dataType: "text",
						nullable: false,
						primaryKey: false,
						unique: false,
					},
				},
			},
		};
		const after: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					name: {
						name: "name",
						dataType: "varchar",
						typeArgs: [255],
						nullable: false,
						primaryKey: false,
						unique: false,
					},
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
					bio: { name: "bio", dataType: "text", nullable: false, primaryKey: false, unique: false },
				},
			},
		};
		const after: DatabaseSchema = {
			users: {
				name: "users",
				columns: {
					bio: { name: "bio", dataType: "text", nullable: true, primaryKey: false, unique: false },
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
					id: { name: "id", dataType: "serial", nullable: false, primaryKey: true, unique: false },
				},
			},
		};

		const changes = diffSchemas(schema, schema);
		expect(changes).toHaveLength(0);
	});
});

// --- SQL Generation ----------------------------------------------------------

describe("generateCreateTable", () => {
	it("generates CREATE TABLE with serial primary key", () => {
		const sql = generateCreateTable("users", {
			id: { name: "id", dataType: "serial", nullable: false, primaryKey: true, unique: false },
			name: { name: "name", dataType: "text", nullable: false, primaryKey: false, unique: false },
		});

		expect(sql).toContain('CREATE TABLE "users"');
		expect(sql).toContain('"id" serial');
		expect(sql).toContain('"name" text NOT NULL');
	});

	it("generates CREATE TABLE with constraints", () => {
		const sql = generateCreateTable("users", {
			email: {
				name: "email",
				dataType: "text",
				nullable: false,
				primaryKey: false,
				unique: true,
				default: "''",
			},
		});

		expect(sql).toContain("UNIQUE");
		expect(sql).toContain("DEFAULT ''");
	});
});

describe("generateAddColumn", () => {
	it("generates ALTER TABLE ADD COLUMN", () => {
		const sql = generateAddColumn("users", {
			name: "email",
			dataType: "text",
			nullable: false,
			primaryKey: false,
			unique: false,
		});

		expect(sql).toContain('ALTER TABLE "users" ADD COLUMN');
		expect(sql).toContain('"email" text NOT NULL');
	});
});

describe("generateDropColumn", () => {
	it("generates ALTER TABLE DROP COLUMN", () => {
		const sql = generateDropColumn("users", "email");
		expect(sql).toBe('ALTER TABLE "users" DROP COLUMN "email";');
	});
});

describe("generateDropTable", () => {
	it("generates DROP TABLE", () => {
		const sql = generateDropTable("users");
		expect(sql).toBe('DROP TABLE "users";');
	});
});

describe("generateAlterColumnType", () => {
	it("generates ALTER COLUMN TYPE", () => {
		const sql = generateAlterColumnType("users", {
			name: "name",
			dataType: "varchar",
			typeArgs: [255],
			nullable: false,
			primaryKey: false,
			unique: false,
		});

		expect(sql).toContain('ALTER TABLE "users" ALTER COLUMN "name" TYPE varchar(255)');
	});
});

// --- Dialect-specific SQL Generation -----------------------------------------

describe("SQLite dialect", () => {
	it("generates CREATE TABLE with INTEGER PRIMARY KEY AUTOINCREMENT", () => {
		const sql = generateCreateTable(
			"users",
			{
				id: { name: "id", dataType: "serial", nullable: false, primaryKey: true, unique: false },
				name: { name: "name", dataType: "text", nullable: false, primaryKey: false, unique: false },
			},
			"sqlite",
		);

		expect(sql).toContain('"id" integer primary key autoincrement');
		expect(sql).toContain('"name" text NOT NULL');
	});

	it("uses TEXT for varchar", () => {
		const sql = generateCreateTable(
			"users",
			{
				email: {
					name: "email",
					dataType: "varchar",
					typeArgs: [255],
					nullable: false,
					primaryKey: false,
					unique: false,
				},
			},
			"sqlite",
		);

		expect(sql).toContain('"email" text(255) NOT NULL');
	});

	it("uses integer for boolean", () => {
		const sql = generateCreateTable(
			"users",
			{
				active: {
					name: "active",
					dataType: "boolean",
					nullable: false,
					primaryKey: false,
					unique: false,
				},
			},
			"sqlite",
		);

		expect(sql).toContain('"active" integer NOT NULL');
	});

	it("generates comment for unsupported ALTER COLUMN TYPE", () => {
		const sql = generateAlterColumnType(
			"users",
			{
				name: "name",
				dataType: "varchar",
				typeArgs: [255],
				nullable: false,
				primaryKey: false,
				unique: false,
			},
			"sqlite",
		);

		expect(sql).toContain("-- SQLite: ALTER COLUMN TYPE not supported");
	});
});

describe("MySQL dialect", () => {
	it("generates CREATE TABLE with AUTO_INCREMENT for serial", () => {
		const sql = generateCreateTable(
			"users",
			{
				id: { name: "id", dataType: "serial", nullable: false, primaryKey: true, unique: false },
			},
			"mysql",
		);

		expect(sql).toContain("`id` int AUTO_INCREMENT PRIMARY KEY");
	});

	it("uses backticks for identifiers", () => {
		const sql = generateCreateTable(
			"users",
			{
				name: { name: "name", dataType: "text", nullable: false, primaryKey: false, unique: false },
			},
			"mysql",
		);

		expect(sql).toContain("`name`");
	});

	it("uses tinyint for boolean", () => {
		const sql = generateCreateTable(
			"users",
			{
				active: {
					name: "active",
					dataType: "boolean",
					nullable: false,
					primaryKey: false,
					unique: false,
				},
			},
			"mysql",
		);

		expect(sql).toContain("`active` tinyint NOT NULL");
	});

	it("uses MODIFY COLUMN for type change", () => {
		const sql = generateAlterColumnType(
			"users",
			{
				name: "name",
				dataType: "varchar",
				typeArgs: [255],
				nullable: false,
				primaryKey: false,
				unique: false,
			},
			"mysql",
		);

		expect(sql).toContain("MODIFY COLUMN");
		expect(sql).toContain("`name` varchar(255)");
	});
});
