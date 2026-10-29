import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node";

import { detectContext, inSqlString, resolveAliases } from "../lib/helpers";
import { SQL_FUNCTIONS, SQL_KEYWORDS } from "./data";
import type { CompletionDeps, CompletionResult } from "./types";

/** Table, column, function and keyword completions for SQL files and sql`` templates. */
export async function sqlCompletions(
	deps: CompletionDeps,
	ctx: { filePath: string; text: string; offset: number },
	resolveDbDir: (filePath: string) => { dbDir: string; targetDb: string } | null,
): Promise<CompletionResult> {
	const isSqlFile = ctx.filePath.endsWith(".sql");
	if (!isSqlFile && !inSqlString(ctx.text, ctx.offset)) return null;
	const resolved = resolveDbDir(ctx.filePath);
	let schema = { tables: [] as string[], columns: new Map() };
	if (resolved) {
		try {
			schema = await deps.getSchema(resolved.dbDir, resolved.targetDb);
		} catch {
			// SQL keywords and functions remain useful without a project schema.
		}
	}
	const before = ctx.text.slice(0, ctx.offset);
	const items: CompletionItem[] = [];
	const aliasMap = resolveAliases(ctx.text);
	const det = detectContext(before, ctx.text);
	const prefix = (before.match(/(\w*)$/) || ["", ""])[1]!.toLowerCase();

	if (det.kind === "table") {
		for (const t of schema.tables) {
			if (t.toLowerCase().startsWith(prefix))
				items.push({ label: t, kind: CompletionItemKind.Class });
		}
		return items;
	}

	if (det.kind === "column") {
		if (!det.tables.length) return [];
		const tables = det.tables.map((t) => aliasMap.get(t) ?? t);
		const seen = new Set<string>();
		for (const t of tables) {
			const cols = schema.columns.get(t) ?? schema.columns.get(t.toLowerCase()) ?? [];
			for (const c of cols) {
				if (c.name.toLowerCase().startsWith(prefix) && !seen.has(c.name)) {
					seen.add(c.name);
					items.push({ label: c.name, kind: CompletionItemKind.Field, detail: c.type });
				}
			}
		}
		return items;
	}

	for (const f of SQL_FUNCTIONS) {
		if (f.toLowerCase().startsWith(prefix))
			items.push({
				label: f,
				kind: CompletionItemKind.Function,
				insertText: f + "($1)",
				insertTextFormat: 2,
			});
	}
	for (const k of SQL_KEYWORDS) {
		if (k.toLowerCase().startsWith(prefix))
			items.push({ label: k, kind: CompletionItemKind.Keyword });
	}
	for (const t of schema.tables) {
		if (t.toLowerCase().startsWith(prefix))
			items.push({ label: t, kind: CompletionItemKind.Class });
	}
	return items;
}
