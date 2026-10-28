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
	test("extracts data signals", () => {
		const sigs = extractSignals('<div data-signals="{count: 0}"></div>');
		expect(Array.isArray(sigs)).toBe(true);
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
