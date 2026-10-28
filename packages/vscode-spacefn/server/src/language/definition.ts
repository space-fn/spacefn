import type { Location } from "vscode-languageserver/node";

import { resolveDbDir } from "../diagnostics/embedded";
import { inSqlString, offsetToPosition, resolveAliases, wordRangeAt } from "../lib/helpers";
import type { LanguageCtx, LanguageDeps } from "./types";

/** Go-to-definition for SQL schema (jump to CREATE TABLE in migrations). */
export async function definition(ctx: LanguageCtx, deps: LanguageDeps): Promise<Location[] | null> {
	const { getSchema, readDir, readFile, joinPath } = deps;
	const offset = ctx.offset;
	const filePath = ctx.filePath;
	const isSqlFile = filePath.endsWith(".sql");
	if (!isSqlFile && !inSqlString(ctx.text, offset)) return null;
	const resolved = resolveDbDir(filePath);
	if (!resolved) return null;
	const wordRange = wordRangeAt(ctx.doc, ctx.position, /[A-Za-z_][A-Za-z0-9_]*/);
	if (!wordRange) return null;
	const word = ctx.doc.getText(wordRange);
	const aliasMap = resolveAliases(ctx.text);
	const target = aliasMap.get(word) ?? word;

	// resolve column -> owning table (if applicable)
	let ownerTable: string | null = null;
	try {
		const schema = await getSchema(resolved.dbDir, resolved.targetDb);
		for (const [t, cols] of schema.columns) {
			if (cols.some((c) => c.name === word)) {
				ownerTable = t;
				break;
			}
		}
	} catch {
		// ignore
	}
	const searchName = ownerTable ?? target;

	const migrationsDir = joinPath(resolved.targetDb, "migrations");
	let files: string[] = [];
	try {
		files = await readDir(migrationsDir);
	} catch {
		return null;
	}
	for (const f of files) {
		if (!f.endsWith(".sql")) continue;
		const full = joinPath(migrationsDir, f);
		const content = await readFile(full);
		const re = new RegExp(
			`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["'\`]?${searchName}["'\`]?`,
			"i",
		);
		const m = content.match(re);
		if (m && m.index !== undefined) {
			// if looking for a column, find its line within the CREATE TABLE block
			let idx = m.index;
			if (ownerTable && ownerTable.toLowerCase() !== target.toLowerCase()) {
				// target was a column name; locate column within table block
				const start = m.index;
				const endIdx = content.indexOf(";", start);
				const block = content.slice(start, endIdx === -1 ? undefined : endIdx);
				const colRe = new RegExp(`\\b${target}\\b`, "i");
				const cm = block.match(colRe);
				if (cm && cm.index !== undefined) idx = start + cm.index;
			} else if (ownerTable) {
				const start = m.index;
				const endIdx = content.indexOf(";", start);
				const block = content.slice(start, endIdx === -1 ? undefined : endIdx);
				const colRe = new RegExp(`\\b${target}\\b`, "i");
				const cm = block.match(colRe);
				if (cm && cm.index !== undefined) idx = start + cm.index;
			}
			const pos = offsetToPosition(content, idx);
			return [
				{
					uri: `file://${full}`,
					range: { start: pos, end: pos },
				},
			];
		}
	}
	return null;
}
