import { parseQueryFile } from "spacefn/db";
import { Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
export type CompletionContext =
	| { kind: "table" }
	| { kind: "column"; tables: string[] }
	| { kind: "keyword" };

import { Parser } from "node-sql-parser";

import { templateAt } from "./templates";

const parser = new Parser();

// Extracted pure helpers from server.ts (no LSP connection dependency).
export function inSqlString(text: string, offset: number): boolean {
	// crude: walk back to find an unclosed quote/backtick
	let i = offset - 1;
	let quote: string | null = null;
	while (i >= 0) {
		const ch = text[i];
		if (ch === "`" || ch === '"' || ch === "'") {
			// count consecutive backslashes
			let bs = 0;
			let j = i - 1;
			while (j >= 0 && text[j] === "\\") {
				bs++;
				j--;
			}
			if (bs % 2 === 0) {
				quote = ch;
				break;
			}
		}
		i--;
	}
	if (!quote) return false;
	// ensure there's a closing quote after offset
	const close = text.indexOf(quote, offset);
	return close !== -1;
}

type Range = { start: number; end: number; contentStart: number };

const pick = (t: Range | null): Range | null =>
	t && { start: t.start, end: t.end, contentStart: t.contentStart };

export function findHtmlTemplateRange(text: string, offset: number): Range | null {
	return pick(templateAt(text, offset, ["html"]));
}

export function findCssTemplateRange(text: string, offset: number): Range | null {
	return pick(templateAt(text, offset, ["css"]));
}

export function findSqlTemplateRange(text: string, offset: number): Range | null {
	return pick(templateAt(text, offset, ["sql", "db"]));
}

export function detectContext(before: string, fullText: string): CompletionContext {
	// table context: last keyword before cursor is a table-introducing keyword
	if (/\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+\w*$/i.test(before)) return { kind: "table" };
	// column context after dot
	const dot = before.match(/(\w+)\.\s*\w*$/);
	if (dot) return { kind: "column", tables: [dot[1]!] };
	// column context: after SELECT/WHERE/ON/GROUP/ORDER/HAVING/SET
	if (
		/\b(SELECT|WHERE|ON|GROUP\s+BY|ORDER\s+BY|HAVING|SET)\s+[\w,\s]*$/i.test(before) &&
		!/\b(FROM|JOIN)\s+\w*$/i.test(before)
	) {
		// try to extract tables from FROM clause in the statement
		const tables = extractTables(fullText);
		if (tables.length) return { kind: "column", tables };
	}
	return { kind: "keyword" };
}

export function resolveAliases(sql: string): Map<string, string> {
	const m = new Map<string, string>();
	try {
		const ast = parser.astify(sql + " ", { database: "sqlite" }) as any;
		const node = Array.isArray(ast) ? ast[0] : ast;
		const from = node?.from;
		if (Array.isArray(from)) {
			for (const n of from) {
				if (n && typeof n.table === "string") {
					m.set(n.table, n.table);
					if (typeof n.as === "string" && n.as) m.set(n.as, n.table);
				}
			}
		}
	} catch {
		// ignore
	}
	return m;
}

export function extractTables(sql: string): string[] {
	try {
		const ast = parser.astify(sql + " ", { database: "sqlite" }) as any;
		const tables = new Set<string>();
		const walk = (node: any) => {
			if (!node || typeof node !== "object") return;
			if (node.table && typeof node.table === "string") tables.add(node.table);
			for (const k of Object.keys(node)) {
				const v = node[k];
				if (Array.isArray(v)) v.forEach(walk);
				else if (v && typeof v === "object") walk(v);
			}
		};
		walk(ast);
		return [...tables];
	} catch {
		// fallback regex
		const m = sql.match(/\bFROM\s+(\w+)/gi);
		return m ? m.map((x) => x.replace(/\bFROM\s+/i, "")) : [];
	}
}

// Extract signals from data-signals:* attributes in HTML

export function extractSignals(htmlText: string): string[] {
	const signals = new Set<string>();
	// match data-signals:signalName="..."
	const re1 = /data-signals:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
	let m;
	while ((m = re1.exec(htmlText)) !== null) {
		// convert kebab to camelCase
		const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		signals.add(name);
	}
	// match data-signals="{signalName: ...}"
	const re2 = /data-signals="\{([^}]+)\}"/g;
	while ((m = re2.exec(htmlText)) !== null) {
		const content = m[1];
		const keyRe = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
		let km;
		while ((km = keyRe.exec(content)) !== null) {
			signals.add(km[1]);
		}
	}
	// match data-bind:signalName
	const re3 = /data-bind:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
	while ((m = re3.exec(htmlText)) !== null) {
		const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		signals.add(name);
	}
	// match data-ref:signalName
	const re4 = /data-ref:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
	while ((m = re4.exec(htmlText)) !== null) {
		const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		signals.add(name);
	}
	// match data-computed:signalName
	const re5 = /data-computed:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
	while ((m = re5.exec(htmlText)) !== null) {
		const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		signals.add(name);
	}
	// match data-indicator:signalName
	const re6 = /data-indicator:([a-zA-Z_][a-zA-Z0-9_-]*)/g;
	while ((m = re6.exec(htmlText)) !== null) {
		const name = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		signals.add(name);
	}
	return [...signals];
}

export function wordRangeAt(
	doc: TextDocument,
	position: Position,
	regex: RegExp,
): { start: Position; end: Position } | null {
	const text = doc.getText();
	const offset = doc.offsetAt(position);
	// expand left
	let start = offset;
	while (start > 0 && regex.test(text[start - 1]!)) start--;
	regex.lastIndex = 0;
	let end = offset;
	while (end < text.length && regex.test(text[end]!)) end++;
	regex.lastIndex = 0;
	if (start === end) return null;
	return { start: doc.positionAt(start), end: doc.positionAt(end) };
}

export function offsetToPosition(text: string, offset: number): Position {
	const before = text.slice(0, offset);
	const lines = before.split("\n");
	return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

export interface SqlDiagnostic {
	severity: number;
	message: string;
}

export function validateSqlDirectives(text: string, file: string): SqlDiagnostic[] {
	const out: SqlDiagnostic[] = [];
	try {
		parseQueryFile(file, text);
	} catch (err) {
		out.push({ severity: 1, message: err instanceof Error ? err.message : String(err) });
	}
	const nameLine = text.split("\n").find((l) => l.trim().startsWith("-- name:"));
	if (nameLine) {
		const m = nameLine.match(/--\s*name:\s*(\S+)(?:\s+:(one|many|exec))?/);
		if (!m) {
			out.push({ severity: 1, message: "Invalid -- name: directive" });
		} else if (!m[2]) {
			out.push({ severity: 1, message: "Query mode must be :one, :many, or :exec" });
		}
	}
	return out;
}
