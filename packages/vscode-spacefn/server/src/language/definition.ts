import type { Location } from "vscode-languageserver/node";

import { resolveDbDir } from "../diagnostics/embedded";
import { offsetToPosition, wordRangeAt } from "../lib/helpers";
import { qualifierBefore, resolveSymbol, scopesAt, statementAt } from "../lib/sqlScope";
import type { LanguageCtx, LanguageDeps, SchemaInfo } from "./types";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Go-to-definition for SQL schema: jump to the CREATE TABLE, or the column's line in it. */
export async function definition(ctx: LanguageCtx, deps: LanguageDeps): Promise<Location[] | null> {
	const { getSchema, readDir, readFile, joinPath } = deps;
	const stmt = statementAt(ctx.text, ctx.offset, ctx.filePath.endsWith(".sql"));
	if (!stmt) return null;
	const resolved = resolveDbDir(ctx.filePath);
	if (!resolved) return null;
	const wordRange = wordRangeAt(ctx.doc, ctx.position, /\w/);
	if (!wordRange) return null;
	const word = ctx.doc.getText(wordRange);

	let schema: SchemaInfo;
	try {
		schema = await getSchema(resolved.dbDir, resolved.targetDb);
	} catch {
		return null;
	}
	const qualifier = qualifierBefore(ctx.text, ctx.doc.offsetAt(wordRange.start));
	// Several targets only for an ambiguous column: VS Code then lets you pick.
	const wordStart = ctx.doc.offsetAt(wordRange.start);
	const symbol = resolveSymbol(schema, scopesAt(stmt.sql, wordStart - stmt.start), word, qualifier);
	if (!symbol) return null;
	const targets =
		symbol.kind === "table"
			? [{ table: symbol.table, column: null }]
			: [...new Set(symbol.matches.map((m) => m.table))].map((table) => ({
					table,
					column: symbol.matches[0]!.column.name,
				}));

	const migrationsDir = joinPath(resolved.targetDb, "migrations");
	let files: string[];
	try {
		files = (await readDir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
	} catch {
		return null;
	}
	const out: Location[] = [];
	for (const { table, column } of targets) {
		const create = new RegExp(
			String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'\`\[]?${escape(table)}\b["'\`\]]?\s*\(`,
			"i",
		);
		for (const f of files) {
			const full = joinPath(migrationsDir, f);
			const content = await readFile(full);
			const m = create.exec(content);
			if (!m) continue;
			let idx = m.index;
			if (column) {
				// A column definition starts a line or follows `(`/`,` in the table's body.
				const bodyStart = m.index + m[0].length;
				const bodyEnd = content.indexOf(";", bodyStart);
				const body = content.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd);
				const col = new RegExp(String.raw`(^|[(,])\s*["'\`\[]?(${escape(column)})\b`, "im").exec(
					"(" + body,
				);
				if (col) idx = bodyStart - 1 + col.index + col[0].length - column.length;
			}
			const pos = offsetToPosition(content, idx);
			out.push({ uri: `file://${full}`, range: { start: pos, end: pos } });
			break;
		}
	}
	return out.length ? out : null;
}
