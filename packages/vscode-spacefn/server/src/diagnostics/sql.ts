import * as path from "node:path";

import { parseQueryFile, scanMigrations, scratchDatabase } from "spacefn/db";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity, Range } from "vscode-languageserver/node";

export async function loadDialectAndMigrations(dbDir: string) {
	let dialect: "sqlite" | "postgres" = "sqlite";
	try {
		const cfg = await import(path.join(dbDir, "config.ts"));
		dialect = (cfg.default ?? cfg).dialect ?? "sqlite";
	} catch {
		dialect = "sqlite";
	}
	const migrations = await scanMigrations(path.join(dbDir, "migrations"));
	return { dialect, migrations };
}

/** Extracts an identifier from a database error message, for underlining. */
export function extractBadIdentifier(message: string): string | null {
	const patterns = [
		/no such column: ["']?([A-Za-z_][A-Za-z0-9_]*)["']?/i,
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

/** Finds the range of `ident` in `doc`, for underlining. */
export function rangeForIdentifier(doc: TextDocument, ident: string): Range | null {
	const text = doc.getText();
	const re = new RegExp("\\b" + ident + "\\b");
	const m = re.exec(text);
	if (!m) return null;
	const start = doc.positionAt(m.index);
	const end = doc.positionAt(m.index + ident.length);
	return { start, end };
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
		const { dialect, migrations } = await loadDialectAndMigrations(dbDir);
		const scratch = await scratchDatabase(migrations, dialect);
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
		const nameLine = text.split("\n").find((l) => l.trim().startsWith("-- name:"));
		if (nameLine) {
			const nm = nameLine.match(/--\s*name:\s*(\S+)(?:\s+:(one|many|exec))?/);
			if (!nm) {
				diagnostics.push({
					severity: DiagnosticSeverity.Error,
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
					message: "Invalid -- name: directive",
					source: "spacefn",
				});
			} else if (!nm[2]) {
				diagnostics.push({
					severity: DiagnosticSeverity.Error,
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
					message: "Query mode must be :one, :many, or :exec",
					source: "spacefn",
				});
			}
		}
		if (sql) {
			const stmt = await scratch.prepare(sql);
			await stmt.columns();
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[spacefn] validate error:", message);
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
