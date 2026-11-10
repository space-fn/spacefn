import { describe, expect, test } from "vite-plus/test";

import { sqlContext } from "../completion/sql";
import { qualifierBefore, resolveSymbol, scopeOf, scopesAt, statementAt } from "./sqlScope";

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

/** Resolves the `nth` use of `word` in `sql`, the way hover and definition do. */
function resolveAt(sql: string, word: string, nth = 0) {
	let at = -1;
	for (let i = 0; i <= nth; i++) at = sql.indexOf(word, at + 1);
	return resolveSymbol(schema, scopesAt(sql, at), word, qualifierBefore(sql, at));
}
const tablesOf = (r: ReturnType<typeof resolveAt>) =>
	r?.kind === "column" ? r.matches.map((m) => m.alias ?? m.table) : r;

describe("resolveSymbol", () => {
	test("resolves a bare column against the statement's tables only", () => {
		const r = resolveAt("SELECT id, email FROM users u WHERE u.id = 1", "id");
		expect(r).toEqual({
			kind: "column",
			matches: [{ table: "users", alias: "u", column: col("id") }],
			ambiguous: false,
		});
	});
	test("resolves a qualified column through its alias", () => {
		expect(tablesOf(resolveAt("SELECT t.id FROM users u JOIN todos t", "id"))).toEqual(["t"]);
	});
	test("an alias resolves to its table", () => {
		expect(resolveAt("SELECT u.id FROM users u", "u")).toEqual({ kind: "table", table: "users" });
	});
	test("a column of another table is not reported", () => {
		expect(resolveAt("SELECT title FROM users", "title")).toBeNull();
	});
	test("a column two joined tables share is ambiguous, with each table listed", () => {
		const r = resolveAt("SELECT id FROM users u JOIN todos t", "id");
		expect(r?.kind === "column" && r.ambiguous).toBe(true);
		expect(tablesOf(r)).toEqual(["u", "t"]);
	});
	test("a self-join is ambiguous too, and `a.id` picks one side", () => {
		const sql = "SELECT id, a.id FROM users a JOIN users b ON a.id = b.id";
		expect(resolveAt(sql, "id")).toMatchObject({ ambiguous: true });
		expect(tablesOf(resolveAt(sql, "id", 1))).toEqual(["a"]);
	});
	test("USING and NATURAL JOIN make a shared column unambiguous", () => {
		expect(resolveAt("SELECT id FROM users JOIN todos USING (id)", "id")).toMatchObject({
			ambiguous: false,
		});
		expect(resolveAt("SELECT id FROM users NATURAL JOIN todos", "id")).toMatchObject({
			ambiguous: false,
		});
	});
	test("each subquery is its own scope", () => {
		const sql = "SELECT id FROM todos WHERE id IN (SELECT id FROM users)";
		expect(tablesOf(resolveAt(sql, "id", 0))).toEqual(["todos"]);
		expect(tablesOf(resolveAt(sql, "id", 2))).toEqual(["users"]);
	});
	test("a correlated subquery falls back to the outer query", () => {
		const sql =
			"SELECT * FROM todos t WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = t.id)";
		expect(tablesOf(resolveAt(sql, "id", 1))).toEqual(["t"]);
		expect(tablesOf(resolveAt(sql, "user_id"))).toEqual(["s"]);
	});
	test("qualifierBefore reads `alias.`", () => {
		const text = "SELECT u.email";
		expect(qualifierBefore(text, text.indexOf("email"))).toBe("u");
	});
});

describe("sqlContext", () => {
	const stmt = "SELECT  FROM users u JOIN todos t ON t.id = u.id";
	const tables = (c: ReturnType<typeof sqlContext>) => (c.kind === "column" ? c.scope.tables : c);
	test("columns of the statement's tables after SELECT, even before FROM is reached", () => {
		expect(tables(sqlContext("SELECT ", stmt))).toEqual(["users", "todos"]);
	});
	test("only that table's columns after `alias.`", () => {
		const c = sqlContext("SELECT t.", stmt);
		expect(c).toMatchObject({ kind: "column", only: true });
		expect(tables(c)).toEqual(["todos"]);
	});
	test("inside a subquery, only the subquery's tables", () => {
		const sql = "SELECT * FROM todos WHERE id IN (SELECT  FROM users)";
		expect(tables(sqlContext(sql.slice(0, sql.indexOf("SELECT  ") + 7), sql))).toEqual(["users"]);
	});
	test("tables after FROM and in a FROM comma list", () => {
		expect(sqlContext("SELECT * FROM ", "").kind).toBe("table");
		expect(sqlContext("SELECT * FROM users u, ", "").kind).toBe("table");
	});
	test("insert column list", () => {
		const c = sqlContext("INSERT INTO todos (ti", "");
		expect(c).toMatchObject({ kind: "column", only: true });
		expect(tables(c)).toEqual(["todos"]);
	});
	test("WHERE ... AND stays a column context", () => {
		expect(sqlContext("SELECT * FROM users WHERE id = 1 AND ", "SELECT * FROM users").kind).toBe(
			"column",
		);
	});
});
