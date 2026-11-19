import { expect, test } from "vitest";

import { SqlError } from "../src/error";
import { orderMigrationFiles, parseMigrationFile } from "../src/migration-file";

test("orders migrations by number and skips drafts and other files", () => {
	expect(orderMigrationFiles(["0010_b.sql", "notes.md", "_draft.sql", "0002_a.sql"])).toEqual([
		"0002_a.sql",
		"0010_b.sql",
	]);
});

test("refuses a name without a number, with a stable code", () => {
	const error = (() => {
		try {
			orderMigrationFiles(["create.sql"]);
		} catch (e) {
			return e;
		}
	})();
	expect(error).toBeInstanceOf(SqlError);
	expect(error).toMatchObject({ code: "MIGRATION_NAME", file: "create.sql" });
});

test("refuses two migrations with the same number", () => {
	expect(() => orderMigrationFiles(["0001_a.sql", "0001_b.sql"])).toThrow(/share the number 1/);
});

test("splits up and down sections in either order", () => {
	expect(
		parseMigrationFile("0001_a.sql", "-- down\nDROP TABLE a;\n-- up\nCREATE TABLE a;\n"),
	).toEqual({
		id: "0001_a",
		sql: "CREATE TABLE a;",
		down: "DROP TABLE a;",
	});
});

test("leaves down out when there is none", () => {
	expect(parseMigrationFile("0001_a.sql", "-- up\nCREATE TABLE a;")).toEqual({
		id: "0001_a",
		sql: "CREATE TABLE a;",
	});
});

test("refuses a migration with no up section", () => {
	expect(() => parseMigrationFile("0001_a.sql", "CREATE TABLE a;")).toThrow(/-- up/);
});
