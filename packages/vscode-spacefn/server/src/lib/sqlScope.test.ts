import { describe, expect, test } from "vite-plus/test";

import { sqlContext } from "../completion/sql";
import { qualifierBefore, resolveSymbol, scopeOf, statementAt } from "./sqlScope";

const col = (name: string) => ({ name, type: "TEXT" });
const schema = {
	tables: ["users", "sessions", "todos"],
	columns: new Map([
		["users", [col("id"), col("email")]],
		["sessions", [col("token_hash"), col("user_id"), col("expires_at")]],
		["todos", [col("id"), col("title")]],
	]),
};

describe("statementAt", () => {
	test("picks the named query under the cursor in a .sql file", () => {
		const text =
			"-- name: a :one\nSELECT id FROM users;\n-- name: b :many\nSELECT title FROM todos;";
		const stmt = statementAt(text, text.indexOf("title"), true)!;
		expect(scopeOf(stmt.sql).tables).toEqual(["todos"]);
	});
	test("reads only the sql template in a .ts file", () => {
		const text = "const x = 'FROM users';\nconst q = sql`SELECT * FROM todos WHERE id = ${id}`;";
		const stmt = statementAt(text, text.indexOf("WHERE"), false)!;
		expect(scopeOf(stmt.sql).tables).toEqual(["todos"]);
		expect(statementAt(text, 12, false)).toBeNull();
	});
});

describe("scopeOf", () => {
	test("reads aliases from joins and comma lists, half-typed SQL included", () => {
		const s = scopeOf(
			"SELECT u. FROM sessions s, todos t JOIN users AS u ON u.id = s.user_id WHERE",
		);
		expect(s.tables).toEqual(["sessions", "todos", "users"]);
		expect(s.aliases.get("u")).toBe("users");
		expect(s.aliases.get("t")).toBe("todos");
		expect(s.aliases.has("on")).toBe(false);
	});
});

describe("resolveSymbol", () => {
	const scope = scopeOf("SELECT id, email FROM users u WHERE u.id = 1");
	test("resolves a bare column against the statement's tables only", () => {
		const r = resolveSymbol(schema, scope, "id", null);
		expect(r).toEqual({ kind: "column", matches: [{ table: "users", column: col("id") }] });
	});
	test("resolves a qualified column through its alias", () => {
		const s = scopeOf("SELECT t.id FROM users u JOIN todos t");
		const r = resolveSymbol(schema, s, "id", "t");
		expect(r?.kind === "column" && r.matches.map((m) => m.table)).toEqual(["todos"]);
	});
	test("an alias resolves to its table", () => {
		expect(resolveSymbol(schema, scope, "u", null)).toEqual({ kind: "table", table: "users" });
	});
	test("a column of another table is not reported", () => {
		expect(resolveSymbol(schema, scope, "title", null)).toBeNull();
	});
	test("reports every in-scope table for an ambiguous column", () => {
		const s = scopeOf("SELECT id FROM users JOIN todos");
		const r = resolveSymbol(schema, s, "id", null);
		expect(r?.kind === "column" && r.matches.map((m) => m.table)).toEqual(["users", "todos"]);
	});
	test("qualifierBefore reads `alias.`", () => {
		const text = "SELECT u.email";
		expect(qualifierBefore(text, text.indexOf("email"))).toBe("u");
	});
});

describe("sqlContext", () => {
	const stmt = "SELECT  FROM users u JOIN todos t ON t.id = u.id";
	test("columns of the statement's tables after SELECT, even before FROM is reached", () => {
		expect(sqlContext("SELECT ", stmt)).toEqual({
			kind: "column",
			tables: ["users", "todos"],
			only: false,
		});
	});
	test("only that table's columns after `alias.`", () => {
		expect(sqlContext("SELECT t.", stmt)).toEqual({
			kind: "column",
			tables: ["todos"],
			only: true,
		});
	});
	test("tables after FROM and in a FROM comma list", () => {
		expect(sqlContext("SELECT * FROM ", "").kind).toBe("table");
		expect(sqlContext("SELECT * FROM users u, ", "").kind).toBe("table");
	});
	test("insert column list", () => {
		expect(sqlContext("INSERT INTO todos (ti", "")).toEqual({
			kind: "column",
			tables: ["todos"],
			only: true,
		});
	});
	test("WHERE ... AND stays a column context", () => {
		expect(sqlContext("SELECT * FROM users WHERE id = 1 AND ", "SELECT * FROM users").kind).toBe(
			"column",
		);
	});
});
