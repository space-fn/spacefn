import { expect, test } from "vitest";

import { namedParams } from "../src/params";

test("rewrites named parameters and remembers their order", () => {
	expect(namedParams("SELECT * FROM t WHERE a = :id AND b = :name AND c = :id")).toEqual({
		sql: "SELECT * FROM t WHERE a = ? AND b = ? AND c = ?",
		names: ["id", "name", "id"],
	});
});

test("leaves placeholders inside strings and comments alone", () => {
	const result = namedParams("SELECT ':not', \"x:y\" -- :comment\nFROM t WHERE a = :id");
	expect(result.names).toEqual(["id"]);
	expect(result.sql).toContain("':not'");
	expect(result.sql).toContain("-- :comment");
});

test("refuses positional parameters", () => {
	expect(() => namedParams("SELECT * FROM t WHERE id = ?")).toThrow("Use named parameters");
});

test("a minus operator before a parameter is not a comment", () => {
	expect(namedParams("SELECT 1 - 1 AS d, :a FROM t").names).toEqual(["a"]);
	expect(namedParams("SELECT :a FROM t WHERE x = y -").names).toEqual(["a"]);
});

test("a :: cast is not a parameter", () => {
	expect(namedParams("SELECT x::text FROM t WHERE id = :id").names).toEqual(["id"]);
});
