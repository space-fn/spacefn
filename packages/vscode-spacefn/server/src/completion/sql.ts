import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node";

import { schemaTable, scopeOf, statementAt } from "../lib/sqlScope";
import { SQL_FUNCTIONS, SQL_KEYWORDS } from "./data";
import type { CompletionDeps, CompletionResult } from "./types";

type Context =
	| { kind: "table" }
	| { kind: "column"; tables: string[]; only: boolean }
	| { kind: "keyword" };

const CLAUSE =
	/\b(SELECT|FROM|JOIN|WHERE|ON|GROUP\s+BY|ORDER\s+BY|HAVING|SET|VALUES|RETURNING|LIMIT|UPDATE|INTO|USING|TABLE|AND|OR|WHEN|THEN|ELSE|CASE)\b/gi;
const COLUMN_CLAUSES = new Set([
	"select",
	"where",
	"on",
	"group by",
	"order by",
	"having",
	"set",
	"returning",
	"and",
	"or",
	"when",
	"then",
	"else",
	"case",
]);

/** What belongs at the cursor, read from the statement text before it. */
export function sqlContext(before: string, statement: string): Context {
	const scope = scopeOf(statement);
	// `alias.` / `table.`: only that table's columns.
	const dot = /([A-Za-z_]\w*)\.\w*$/.exec(before);
	if (dot) {
		const table = scope.aliases.get(dot[1]!.toLowerCase()) ?? dot[1]!;
		return { kind: "column", tables: [table], only: true };
	}
	// INSERT INTO t (a, b|
	const insert = /\bINTO\s+["`]?(\w+)["`]?\s*\([^)]*$/i.exec(before);
	if (insert) return { kind: "column", tables: [insert[1]!], only: true };
	if (/\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+["`]?\w*$/i.test(before)) return { kind: "table" };
	const last = [...before.matchAll(CLAUSE)].at(-1)?.[1]?.toLowerCase().replace(/\s+/g, " ");
	// FROM a, b|
	if (last === "from" && /,\s*\w*$/.test(before)) return { kind: "table" };
	if (last && COLUMN_CLAUSES.has(last))
		return { kind: "column", tables: scope.tables, only: false };
	return { kind: "keyword" };
}

/** Table, column, function and keyword completions for SQL files and sql`` templates. */
export async function sqlCompletions(
	deps: CompletionDeps,
	ctx: { filePath: string; text: string; offset: number },
	resolveDbDir: (filePath: string) => { dbDir: string; targetDb: string } | null,
): Promise<CompletionResult> {
	const stmt = statementAt(ctx.text, ctx.offset, ctx.filePath.endsWith(".sql"));
	if (!stmt) return null;
	const resolved = resolveDbDir(ctx.filePath);
	let schema = { tables: [] as string[], columns: new Map() } as Awaited<
		ReturnType<CompletionDeps["getSchema"]>
	>;
	if (resolved) {
		try {
			schema = await deps.getSchema(resolved.dbDir, resolved.targetDb);
		} catch {
			// SQL keywords and functions remain useful without a project schema.
		}
	}
	const before = stmt.sql.slice(0, ctx.offset - stmt.start);
	const prefix = (/(\w*)$/.exec(before)?.[1] ?? "").toLowerCase();
	const det = sqlContext(before, stmt.sql);
	const items: CompletionItem[] = [];
	const tableItems = () => {
		for (const t of schema.tables) {
			if (t.toLowerCase().startsWith(prefix))
				items.push({ label: t, kind: CompletionItemKind.Class, sortText: `1${t}` });
		}
	};

	if (det.kind === "table") {
		tableItems();
		return items;
	}

	if (det.kind === "column") {
		const seen = new Set<string>();
		const tables = det.tables.map((t) => schemaTable(schema, t)).filter((t): t is string => !!t);
		for (const t of tables) {
			for (const c of schema.columns.get(t) ?? []) {
				if (!c.name.toLowerCase().startsWith(prefix) || seen.has(c.name)) continue;
				seen.add(c.name);
				items.push({
					label: c.name,
					kind: CompletionItemKind.Field,
					detail: `${t}.${c.name} : ${c.type}`,
					// Columns of the query's tables come before keywords and functions.
					sortText: `0${c.name}`,
				});
			}
		}
		if (det.only) return items;
	}

	for (const f of SQL_FUNCTIONS) {
		if (f.toLowerCase().startsWith(prefix))
			items.push({
				label: f,
				kind: CompletionItemKind.Function,
				insertText: f + "($1)",
				insertTextFormat: 2,
				sortText: `2${f}`,
			});
	}
	for (const k of SQL_KEYWORDS) {
		if (k.toLowerCase().startsWith(prefix))
			items.push({ label: k, kind: CompletionItemKind.Keyword, sortText: `3${k}` });
	}
	if (det.kind === "keyword") tableItems();
	return items;
}
