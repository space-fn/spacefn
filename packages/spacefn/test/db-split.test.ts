import { expect, test } from "vitest";

import { splitStatements } from "../src/db/split";

test("splits on semicolons", () => {
	expect(splitStatements("CREATE TABLE a (x); INSERT INTO a VALUES (1);")).toEqual([
		"CREATE TABLE a (x)",
		"INSERT INTO a VALUES (1)",
	]);
});

test("keeps semicolons inside string literals", () => {
	expect(splitStatements("INSERT INTO a VALUES ('x; y'); SELECT \"a;b\"")).toEqual([
		"INSERT INTO a VALUES ('x; y')",
		'SELECT "a;b"',
	]);
});

test("ignores semicolons in comments", () => {
	expect(splitStatements("-- note; here\nSELECT 1; /* a; b */ SELECT 2")).toEqual([
		"-- note; here\nSELECT 1",
		"/* a; b */ SELECT 2",
	]);
});

test("keeps a trigger body together", () => {
	const trigger = `CREATE TRIGGER t AFTER INSERT ON a BEGIN
		UPDATE a SET n = n + 1;
		INSERT INTO log VALUES (1);
	END;
	SELECT 1`;
	const statements = splitStatements(trigger);
	expect(statements).toHaveLength(2);
	expect(statements[0]).toContain("INSERT INTO log VALUES (1);\n\tEND");
});

test("drops empty and comment-only statements", () => {
	expect(splitStatements(" ; -- nothing\n ;SELECT 1;\n")).toEqual(["SELECT 1"]);
});

test("does not treat identifiers containing END as block ends", () => {
	expect(splitStatements("SELECT append FROM t; SELECT 2")).toEqual([
		"SELECT append FROM t",
		"SELECT 2",
	]);
});
