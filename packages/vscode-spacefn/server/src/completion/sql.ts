import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node";

import {
	columnsIn,
	isShared,
	scopeOf,
	scopesAt,
	statementAt,
	type SqlScope,
} from "../lib/sqlScope";
import { SQL_FUNCTIONS, SQL_KEYWORDS } from "./data";
import type { CompletionDeps, CompletionResult } from "./types";

/** `scope` holds the tables whose columns belong at the cursor; `only` drops keywords. */
type Context =
	| { kind: "table" }
	| { kind: "column"; scope: SqlScope; only: boolean }
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
	// The query level the cursor is in: a subquery sees its own tables, not its parent's.
	const scopes = scopesAt(statement, before.length);
	const scope = scopes[0]!;
	// `alias.` / `table.`: only that reference's columns, found at the nearest level naming it.
	const dot = /([A-Za-z_]\w*)\.\w*$/.exec(before);
	if (dot) {
		const q = dot[1]!.toLowerCase();
		for (const s of scopes) {
			const refs = s.refs.filter((r) => (r.alias ?? r.table).toLowerCase() === q);
			const ref = refs[0];
			if (ref)
				return { kind: "column", scope: { ...s, refs: [ref], tables: [ref.table] }, only: true };
		}
		return { kind: "column", scope: scopeOf(`FROM ${dot[1]}`), only: true };
	}
	// INSERT INTO t (a, b|
	const insert = /\bINTO\s+["`]?(\w+)["`]?\s*\([^)]*$/i.exec(before);
	if (insert) return { kind: "column", scope: scopeOf(`FROM ${insert[1]}`), only: true };
	if (/\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+["`]?\w*$/i.test(before)) return { kind: "table" };
	const last = [...before.matchAll(CLAUSE)].at(-1)?.[1]?.toLowerCase().replace(/\s+/g, " ");
	// FROM a, b|
	if (last === "from" && /,\s*\w*$/.test(before)) return { kind: "table" };
	if (last && COLUMN_CLAUSES.has(last)) return { kind: "column", scope, only: false };
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
		const all = columnsIn(schema, det.scope);
		const byName = new Map<string, typeof all>();
		for (const m of all) {
			const key = m.column.name.toLowerCase();
			if (key.startsWith(prefix)) byName.set(key, [...(byName.get(key) ?? []), m]);
		}
		for (const matches of byName.values()) {
			const name = matches[0]!.column.name;
			// A name several tables share would be rejected bare, so offer `u.id`, `t.id` instead.
			const qualify = matches.length > 1 && !isShared(det.scope, name);
			for (const { table, alias, column } of qualify ? matches : matches.slice(0, 1)) {
				const label = qualify ? `${alias ?? table}.${name}` : name;
				items.push({
					label,
					kind: CompletionItemKind.Field,
					detail: `${table}.${name} : ${column.type}`,
					filterText: name,
					insertText: label,
					// Columns of the query's tables come before keywords and functions.
					sortText: `0${label}`,
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
