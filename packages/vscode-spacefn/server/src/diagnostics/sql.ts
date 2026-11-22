import * as path from "node:path";

import { parseQueryFile } from "spacefn/internal/sql";
import { scanMigrations, scratchDatabase } from "spacefn/internal/sql/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver/node";

import { maskSql } from "../lib/sqlScope";

/** Every spacefn driver (D1, Durable Object SQLite, libSQL) speaks SQLite, so only the migrations matter. */
export function loadMigrations(dbDir: string) {
	return scanMigrations(path.join(dbDir, "migrations"));
}

/** Extracts an identifier from a database error message, for underlining. */
export function extractBadIdentifier(message: string): string | null {
	const patterns = [
		// `no such column: u.foo` names `foo`, not the alias.
		/no such column: ["']?(?:[A-Za-z_]\w*\.)?([A-Za-z_][A-Za-z0-9_]*)["']?/i,
		/ambiguous column name: ["']?(?:[A-Za-z_]\w*\.)?([A-Za-z_][A-Za-z0-9_]*)["']?/i,
		/column reference ["']([A-Za-z_][A-Za-z0-9_]*)["'] is ambiguous/i,
		/column ["']([A-Za-z_][A-Za-z0-9_]*)["'] does not exist/i,
		/Unknown column ['"]([A-Za-z_][A-Za-z0-9_]*)['"]/i,
		/relation .* has no column named ["']?([A-Za-z_][A-Za-z0-9_]*)["']?/i,
		/no such table: ["']?([A-Za-z_][A-Za-z0-9_]*)["']?/i,
		/relation ["']?([A-Za-z_][A-Za-z0-9_]*)["']? does not exist/i,
	];
	for (const p of patterns) {
		const m = message.match(p);
		if (m) return m[1]!;
	}
	return null;
}

/**
 * Finds `ident` in `doc` between `from` and `to` (the SQL being checked), for underlining.
 * Comments and strings are skipped, and an unqualified use is preferred: that is the one an
 * "ambiguous column" error is about.
 */
export function rangeForIdentifier(
	doc: TextDocument,
	ident: string,
	from = 0,
	to = doc.getText().length,
): Range | null {
	const sql = maskSql(doc.getText().slice(from, to));
	const uses = [...sql.matchAll(new RegExp(String.raw`\b${ident}\b`, "g"))];
	const m = uses.find((u) => !/\.\s*$/.test(sql.slice(0, u.index))) ?? uses[0];
	if (!m) return null;
	return {
		start: doc.positionAt(from + m.index!),
		end: doc.positionAt(from + m.index! + ident.length),
	};
}

/** Validates a query file and returns diagnostics. */
export async function validateSqlDiagnostics(doc: TextDocument): Promise<Diagnostic[]> {
	const uri = doc.uri;
	const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.replace("file://", "")) : uri;
	const m = filePath.match(/[/\\]app[/\\]db[/\\]([^/\\]+)[/\\]queries[/\\]/);
	if (!m) return [];
	const dbDir = filePath.replace(/[/\\]queries[/\\].*/, "");
	const diagnostics: Diagnostic[] = [];
	try {
		const migrations = await loadMigrations(dbDir);
		const scratch = await scratchDatabase(migrations);
		const text = doc.getText();
		// structural validation of directive comments (case/when/end, undeclared params)
		try {
			parseQueryFile(filePath, text);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			diagnostics.push({
				severity: DiagnosticSeverity.Error,
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
				message,
				source: "spacefn",
			});
		}
		const sql = text
			.split("\n")
			.filter((l) => !l.trim().startsWith("--"))
			.join("\n")
			.trim();
		if (sql) {
			const stmt = await scratch.prepare(sql);
			await stmt.columns();
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const ident = extractBadIdentifier(message);
		const range = (ident && rangeForIdentifier(doc, ident)) || {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 1 },
		};
		diagnostics.push({
			severity: DiagnosticSeverity.Error,
			range,
			message,
			source: "spacefn",
		});
	}
	return diagnostics;
}
