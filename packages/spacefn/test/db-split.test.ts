import { expect, test } from "vite-plus/test";

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

test("keeps a trigger together when its body uses CASE ... END", () => {
	const trigger = `CREATE TRIGGER trg AFTER INSERT ON a BEGIN
  UPDATE b SET x = CASE WHEN NEW.id > 0 THEN 1 ELSE 0 END WHERE id = NEW.id;
END;
SELECT 1;`;
	const parts = splitStatements(trigger);
	expect(parts).toHaveLength(2);
	expect(parts[0]).toContain("CREATE TRIGGER");
	expect(parts[0]).toContain("END");
});

test("splits top-level CASE ... END on its own", () => {
	expect(splitStatements("UPDATE t SET x = CASE WHEN a THEN 1 ELSE 2 END; SELECT 1")).toEqual([
		"UPDATE t SET x = CASE WHEN a THEN 1 ELSE 2 END",
		"SELECT 1",
	]);
});

test("refuses transaction statements with a clear error", () => {
	for (const script of [
		"BEGIN TRANSACTION; CREATE TABLE a (x INT);",
		"BEGIN;",
		"COMMIT;",
		"ROLLBACK;",
		"UPDATE t SET x = 1; END;",
	]) {
		expect(() => splitStatements(script), script).toThrow(/not allowed in migrations/);
	}
});

test("a minus operator before a semicolon is not a comment", () => {
	expect(splitStatements("UPDATE t SET x = x - 1; SELECT 1")).toEqual([
		"UPDATE t SET x = x - 1",
		"SELECT 1",
	]);
});

test("block comments hide their contents", () => {
	expect(splitStatements("SELECT 1 /* BEGIN; END; */; SELECT 2")).toEqual([
		"SELECT 1 /* BEGIN; END; */",
		"SELECT 2",
	]);
});
