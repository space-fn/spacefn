import { describe, expect, test } from "vite-plus/test";
import { TextDocument } from "vscode-languageserver-textdocument";

import { extractBadIdentifier, rangeForIdentifier } from "./sql";

describe("extractBadIdentifier", () => {
	test("no such column", () => {
		expect(extractBadIdentifier('no such column: "foo"')).toBe("foo");
	});
	test("column does not exist", () => {
		expect(extractBadIdentifier('column "bar" does not exist')).toBe("bar");
	});
	test("no such table", () => {
		expect(extractBadIdentifier("no such table: users")).toBe("users");
	});
	test("unrelated message", () => {
		expect(extractBadIdentifier("syntax error near FROM")).toBeNull();
	});
});

describe("rangeForIdentifier", () => {
	test("finds identifier", () => {
		const doc = TextDocument.create("file:///q.sql", "sql", 1, "SELECT foo FROM bar");
		const r = rangeForIdentifier(doc, "foo");
		expect(r).not.toBeNull();
		expect(doc.getText(r as never)).toBe("foo");
	});
	test("returns null when absent", () => {
		const doc = TextDocument.create("file:///q.sql", "sql", 1, "SELECT 1");
		expect(rangeForIdentifier(doc, "foo")).toBeNull();
	});
});

describe("ambiguous columns", () => {
	test("the identifier is read from SQLite and Postgres messages", () => {
		expect(extractBadIdentifier("ambiguous column name: id")).toBe("id");
		expect(extractBadIdentifier('column reference "id" is ambiguous')).toBe("id");
		expect(extractBadIdentifier("no such column: u.nope")).toBe("nope");
	});
	test("the unqualified use inside the SQL is underlined, not a comment or other code", () => {
		const text = "// id here\nconst q = sql`SELECT u.id, id FROM users u JOIN todos t`;";
		const doc = TextDocument.create("file:///a.ts", "typescript", 1, text);
		const from = text.indexOf("SELECT");
		const r = rangeForIdentifier(doc, "id", from, text.lastIndexOf("`"))!;
		expect(doc.offsetAt(r.start)).toBe(text.indexOf(", id") + 2);
	});
});
