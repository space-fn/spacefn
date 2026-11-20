import { scratchDatabase } from "spacefn/sql/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";

import { resolveDb, type ResolvedDb } from "../lib/project";
import { taggedTemplates } from "../lib/templates";
import { extractBadIdentifier, loadMigrations, rangeForIdentifier } from "./sql";

export async function validateEmbedded(doc: TextDocument): Promise<Diagnostic[]> {
	const uri = doc.uri;
	const filePath = uri.startsWith("file://") ? decodeURIComponent(uri.replace("file://", "")) : uri;
	if (!filePath.endsWith(".ts") && !filePath.endsWith(".js")) return [];
	const text = doc.getText();
	const resolved = resolveDbDir(filePath, text);
	if (!resolved) return [];
	const targetDb = resolved.targetDb;

	const diagnostics: Diagnostic[] = [];
	const migrations = await loadMigrations(targetDb);
	const scratch = await scratchDatabase(migrations);
	for (const tpl of taggedTemplates(text, ["sql"])) {
		const body = text.slice(tpl.contentStart, tpl.end);
		if (BUILDS_SQL.test(body)) continue;
		const sql = body.replace(/\$\{[\s\S]*?\}/g, "NULL");
		const startOffset = tpl.contentStart;
		const startPos = doc.positionAt(startOffset);
		try {
			const stmt = await scratch.prepare(sql);
			await stmt.columns();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[spacefn] validateEmbedded error:", message);
			const ident = extractBadIdentifier(message);
			const range = (ident && rangeForIdentifier(doc, ident, tpl.contentStart, tpl.end)) || {
				start: startPos,
				end: startPos,
			};
			diagnostics.push({
				severity: DiagnosticSeverity.Error,
				range,
				message,
				source: "spacefn",
			});
		}
	}
	return diagnostics;
}

/** Which database a file's SQL runs against; see {@link resolveDb}. */
export function resolveDbDir(filePath: string, source?: string): ResolvedDb | null {
	return resolveDb(filePath, source);
}

/** Effect's `sql("table")` and `sql.in(...)` build SQL, so a placeholder can't stand in for them. */
const BUILDS_SQL = /\$\{\s*sql\s*[(.]/;
