import { describe, expect, test } from "vite-plus/test";

import { offsetToPosition } from "./helpers";

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

import { findHtmlTemplateRange, findSqlTemplateRange, extractSignals } from "./helpers";

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

import { wordRangeAt } from "./helpers";

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
