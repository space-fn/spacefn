import { parseQueryFile } from "spacefn/db";
import { Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { templateAt } from "./templates";
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
