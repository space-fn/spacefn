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
