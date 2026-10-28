import { describe, expect, test } from "vite-plus/test";

import { detectContext, inSqlString, offsetToPosition } from "./helpers";

describe("inSqlString", () => {
	test("false outside strings", () => {
		expect(inSqlString("SELECT 1", 5)).toBe(false);
	});
	test("true inside backtick", () => {
		expect(inSqlString("SELECT `a`", 8)).toBe(true);
	});
});

describe("detectContext", () => {
	test("table after FROM", () => {
		const ctx = detectContext("SELECT * FROM ", "SELECT * FROM ");
		expect(ctx.kind).toBe("table");
	});
});

describe("offsetToPosition", () => {
	test("first char", () => {
		const pos = offsetToPosition("abc", 0);
		expect(pos.line).toBe(0);
		expect(pos.character).toBe(0);
	});
	test("second line", () => {
		const pos = offsetToPosition("ab\ncd", 3);
		expect(pos.line).toBe(1);
		expect(pos.character).toBe(0);
	});
});

import {
	findHtmlTemplateRange,
	findSqlTemplateRange,
	resolveAliases,
	extractSignals,
} from "./helpers";

describe("findHtmlTemplateRange", () => {
	test("finds template", () => {
		const text = "const x = html`<div>hi</div>`;";
		const r = findHtmlTemplateRange(text, text.indexOf("hi"));
		expect(r).not.toBeNull();
		expect(text.slice(r!.contentStart, r!.end)).toContain("hi");
	});
	test("returns null outside", () => {
		expect(findHtmlTemplateRange("const x = 1;", 5)).toBeNull();
	});
});

describe("findSqlTemplateRange", () => {
	test("finds sql template", () => {
		const text = "const q = sql`SELECT 1`;";
		const r = findSqlTemplateRange(text, text.indexOf("SELECT"));
		expect(r).not.toBeNull();
	});
});

describe("detectContext", () => {
	test("table after FROM", () => {
		expect(detectContext("SELECT * FROM ", "SELECT * FROM ").kind).toBe("table");
	});
	test("column after SELECT", () => {
		const ctx = detectContext("SELECT ", "SELECT ");
		expect(["column", "keyword"].includes(ctx.kind)).toBe(true);
	});
});

describe("resolveAliases", () => {
	test("resolves aliases", () => {
		const m = resolveAliases("SELECT u.name FROM users u");
		expect(m.get("u")).toBe("users");
	});
});

describe("extractSignals", () => {
	test("extracts signals from data-signals object", () => {
		const sigs = extractSignals(`<div data-signals="{count: 0, name: 'x'}"></div>`);
		expect(sigs).toContain("count");
		expect(sigs).toContain("name");
	});
	test("extracts kebab-case signal names as camelCase", () => {
		const sigs = extractSignals('<input data-signals:my-count="1">');
		expect(sigs).toContain("myCount");
	});
	test("extracts data-bind signals", () => {
		const sigs = extractSignals('<input data-bind:value="count">');
		expect(sigs).toContain("value");
	});
	test("returns empty for no signals", () => {
		expect(extractSignals("<div></div>")).toEqual([]);
	});
});

describe("findHtmlTemplateRange extra", () => {
	test("nested braces", () => {
		const text = "const x = html`<div>${foo ? `{` : `}`}</div>`;";
		const r = findHtmlTemplateRange(text, text.indexOf("foo"));
		expect(r).not.toBeNull();
	});
	test("cursor outside returns null", () => {
		const text = "const y = 1; const x = html`<div>hi</div>`;";
		const r = findHtmlTemplateRange(text, text.indexOf("const y"));
		expect(r).toBeNull();
	});
});

import { validateSqlDirectives } from "./helpers";

describe("validateSqlDirectives", () => {
	test("valid directive", () => {
		const d = validateSqlDirectives("-- name: foo :one\nSELECT 1", "q.sql");
		expect(d).toHaveLength(0);
	});
	test("missing mode", () => {
		const d = validateSqlDirectives("-- name: foo\nSELECT 1", "q.sql");
		expect(d.some((x) => x.message.includes("Query mode"))).toBe(true);
	});
	test("undeclared param in when", () => {
		const d = validateSqlDirectives(
			"-- name: foo :one\n-- @param x int\n-- case\n-- when y\nSELECT 1",
			"q.sql",
		);
		expect(d.length).toBeGreaterThan(0);
	});
});

import { TextDocument } from "vscode-languageserver-textdocument";

import { extractTables, wordRangeAt } from "./helpers";

describe("extractTables", () => {
	test("extracts FROM table", () => {
		expect(extractTables("SELECT * FROM users")).toContain("users");
	});
	test("extracts JOIN table", () => {
		expect(extractTables("SELECT * FROM a JOIN b ON a.x = b.x")).toContain("b");
	});
	test("empty sql", () => {
		expect(extractTables("")).toEqual([]);
	});
});

describe("wordRangeAt", () => {
	const mk = (text: string) => TextDocument.create("file:///t.ts", "typescript", 1, text);
	test("expands word at middle", () => {
		const doc = mk("hello world");
		const r = wordRangeAt(doc, { line: 0, character: 2 } as never, /\w/);
		expect(r).not.toBeNull();
		expect(doc.getText({ start: r!.start, end: r!.end } as never)).toBe("hello");
	});
	test("second word", () => {
		const doc = mk("hello world");
		const r = wordRangeAt(doc, { line: 0, character: 8 } as never, /\w/);
		expect(doc.getText({ start: r!.start, end: r!.end } as never)).toBe("world");
	});
	test("no adjacent word returns null", () => {
		const doc = mk(" a");
		expect(wordRangeAt(doc, { line: 0, character: 0 } as never, /\w/)).toBeNull();
	});
});
