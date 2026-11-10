import { templateAt } from "./templates";

/** The SQL statement around the cursor: `sql` is masked text, `start` its offset in the file. */
export interface SqlStatement {
	sql: string;
	start: number;
}

const NOT_ALIAS = new Set(
	(
		"where on join left right inner outer cross natural full set values select from group order " +
		"limit offset using returning union except intersect having window as and or default not " +
		"on conflict do"
	).split(" "),
);

/**
 * Blanks comments, string literals and `${}` holes with spaces (offsets are kept), so scanning for
 * keywords never matches inside them.
 */
export function maskSql(sql: string): string {
	return sql.replace(/--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*'?|\$\{[^}]*\}?/g, (m) =>
		" ".repeat(m.length),
	);
}

/**
 * The statement containing `offset`: in a `.sql` file the `;`/`-- name:` separated part of the
 * file, in JS/TS the part of the sql`` or db`` template. Null when the cursor is not in SQL.
 */
export function statementAt(text: string, offset: number, isSqlFile: boolean): SqlStatement | null {
	let start = 0;
	let end = text.length;
	if (!isSqlFile) {
		const tpl = templateAt(text, offset, ["sql", "db"]);
		if (!tpl) return null;
		start = tpl.contentStart;
		end = tpl.end;
	}
	// Separators are found on the masked text; `-- name:` lines are blanked by masking, so look
	// for them on the raw text.
	const raw = text.slice(start, end);
	const masked = maskSql(raw);
	const cuts = [0];
	for (let i = 0; i < masked.length; i++) if (masked[i] === ";") cuts.push(i + 1);
	for (const m of raw.matchAll(/^[ \t]*--\s*name:/gm)) cuts.push(m.index!);
	cuts.push(masked.length);
	cuts.sort((a, b) => a - b);
	const rel = offset - start;
	let from = 0;
	let to = masked.length;
	for (let i = 0; i < cuts.length - 1; i++) {
		if (cuts[i]! <= rel && rel <= cuts[i + 1]!) {
			from = cuts[i]!;
			to = cuts[i + 1]!;
		}
	}
	return { sql: masked.slice(from, to), start: start + from };
}

/** One table reference in a FROM/JOIN/UPDATE/INTO list, with the alias it was given. */
export interface TableRef {
	table: string;
	alias: string | null;
}

/**
 * The tables one query level reads or writes. `aliases` maps lower-cased aliases and table
 * names to tables; `shared` holds columns a `JOIN ... USING (...)` merges, and `natural` is set
 * when a NATURAL JOIN merges every common column.
 */
export interface SqlScope {
	refs: TableRef[];
	tables: string[];
	aliases: Map<string, string>;
	shared: Set<string>;
	natural: boolean;
}

/** Reads FROM/JOIN/UPDATE/INTO targets and their aliases; tolerant of half-typed SQL. */
export function scopeOf(sql: string): SqlScope {
	const scope: SqlScope = {
		refs: [],
		tables: [],
		aliases: new Map(),
		shared: new Set(),
		natural: /\bNATURAL\s+(?:LEFT\s+|INNER\s+|CROSS\s+)?JOIN\b/i.test(sql),
	};
	const add = (table: string, alias: string | undefined) => {
		scope.refs.push({ table, alias: alias ?? null });
		if (!scope.tables.includes(table)) scope.tables.push(table);
		scope.aliases.set(table.toLowerCase(), table);
		if (alias) scope.aliases.set(alias.toLowerCase(), table);
	};
	const ident = String.raw`["\`\[]?([A-Za-z_]\w*)["\`\]]?`;
	// The alias must not be a keyword, or `FROM a JOIN b` would read JOIN as a's alias and miss b.
	const alias = String.raw`(?:\s+(?:AS\s+)?(?!(?:${[...NOT_ALIAS].join("|")})\b)([A-Za-z_]\w*))?`;
	const target = new RegExp(String.raw`\b(?:FROM|JOIN|UPDATE|INTO)\s+${ident}${alias}`, "gi");
	const more = new RegExp(String.raw`^\s*,\s*${ident}${alias}`, "i");
	for (const m of sql.matchAll(target)) {
		add(m[1]!, m[2]);
		// `FROM a x, b y`: keep reading the comma list.
		let rest = sql.slice(m.index! + m[0].length);
		let c: RegExpExecArray | null;
		while ((c = more.exec(rest))) {
			add(c[1]!, c[2]);
			rest = rest.slice(c[0].length);
		}
	}
	for (const m of sql.matchAll(/\bUSING\s*\(([^)]*)\)/gi)) {
		for (const name of m[1]!.split(","))
			scope.shared.add(name.trim().replace(/["`]/g, "").toLowerCase());
	}
	return scope;
}

/** `(SELECT ...)` groups of `sql`, outermost first, as [open paren, close paren] offsets. */
function subqueries(sql: string): [number, number][] {
	const out: [number, number][] = [];
	const open: number[] = [];
	for (let i = 0; i < sql.length; i++) {
		if (sql[i] === "(") open.push(i);
		else if (sql[i] === ")" && open.length) {
			const start = open.pop()!;
			if (/^\(\s*(SELECT|WITH)\b/i.test(sql.slice(start, start + 12))) out.push([start, i]);
		}
	}
	return out.sort((a, b) => a[0] - b[0]);
}

/**
 * The query levels around `rel` (an offset into `sql`), innermost first: each `(SELECT ...)`
 * containing it, then the statement itself. A level never sees the tables of subqueries nested
 * in it, so `SELECT id FROM todos WHERE id IN (SELECT id FROM users)` keeps the two `id`s apart.
 */
export function scopesAt(sql: string, rel: number): SqlScope[] {
	const groups = subqueries(sql);
	const levels: [number, number][] = [
		[-1, sql.length],
		...groups.filter(([s, e]) => s < rel && rel <= e),
	];
	return levels.reverse().map(([s, e]) => {
		// Blank the level's own nested subqueries, keeping the parens so `FROM (...) x` stays
		// unreadable as a table.
		let text = sql.slice(s + 1, e);
		for (const [gs, ge] of groups) {
			if (gs > s && ge < e) {
				const a = gs - s - 1;
				const b = ge - s - 1;
				text = text.slice(0, a + 1) + " ".repeat(b - a - 1) + text.slice(b);
			}
		}
		return scopeOf(text);
	});
}

/** The `x` in `x.word` when the word at `wordStart` is qualified. */
export function qualifierBefore(text: string, wordStart: number): string | null {
	const m = /([A-Za-z_]\w*)\.\s*$/.exec(text.slice(Math.max(0, wordStart - 64), wordStart));
	return m ? m[1]! : null;
}

interface Column {
	name: string;
}
interface Schema<C extends Column> {
	tables: string[];
	columns: Map<string, C[]>;
}

/** The schema's spelling of `name`, matched without case. */
export function schemaTable<C extends Column>(schema: Schema<C>, name: string): string | null {
	const lower = name.toLowerCase();
	return schema.tables.find((t) => t.toLowerCase() === lower) ?? null;
}

export interface ColumnMatch<C extends Column> {
	table: string;
	alias: string | null;
	column: C;
}

export type SqlSymbol<C extends Column> =
	| { kind: "table"; table: string }
	| { kind: "column"; matches: ColumnMatch<C>[]; ambiguous: boolean };

/** Columns named `name` (any case) of each table reference in `scope`. */
export function columnsIn<C extends Column>(
	schema: Schema<C>,
	scope: SqlScope,
	name?: string,
): ColumnMatch<C>[] {
	const lower = name?.toLowerCase();
	return scope.refs.flatMap(({ table: t, alias }) => {
		const table = schemaTable(schema, t);
		if (!table) return [];
		return (schema.columns.get(table) ?? [])
			.filter((c) => lower === undefined || c.name.toLowerCase() === lower)
			.map((column) => ({ table, alias, column }));
	});
}

/** Whether an unqualified `column` is legal although several tables of `scope` have it. */
export function isShared(scope: SqlScope, column: string): boolean {
	return scope.natural || scope.shared.has(column.toLowerCase());
}

/**
 * What `word` names at the cursor: a table (directly or through an alias), or the column it
 * refers to. `scopes` are the query levels innermost first (see `scopesAt`); a name resolves at
 * the innermost level that has it, as SQL does, and tables outside the statement are never
 * consulted for columns. `ambiguous` is set only when SQL itself would reject the reference.
 */
export function resolveSymbol<C extends Column>(
	schema: Schema<C>,
	scopes: SqlScope[],
	word: string,
	qualifier: string | null,
): SqlSymbol<C> | null {
	const lower = word.toLowerCase();
	if (qualifier) {
		for (const scope of scopes) {
			const q = qualifier.toLowerCase();
			// `a.id` in `users a JOIN users b` names one reference, not every users table.
			const refs = scope.refs.filter((r) => (r.alias ?? r.table).toLowerCase() === q);
			if (!refs.length) continue;
			const matches = columnsIn(schema, { ...scope, refs }, word).slice(0, 1);
			return matches.length ? { kind: "column", matches, ambiguous: false } : null;
		}
		const table = schemaTable(schema, qualifier);
		const col = table && schema.columns.get(table)?.find((c) => c.name.toLowerCase() === lower);
		if (!col) return null;
		return {
			kind: "column",
			matches: [{ table: table!, alias: null, column: col }],
			ambiguous: false,
		};
	}
	for (const scope of scopes) {
		// An alias or a table of this level (aliases holds both).
		const aliased = scope.aliases.get(lower);
		const table = aliased && schemaTable(schema, aliased);
		if (table) return { kind: "table", table };
		const matches = columnsIn(schema, scope, word);
		if (!matches.length) continue;
		if (matches.length > 1 && isShared(scope, word))
			return { kind: "column", matches: matches.slice(0, 1), ambiguous: false };
		return { kind: "column", matches, ambiguous: matches.length > 1 };
	}
	const table = schemaTable(schema, word);
	return table ? { kind: "table", table } : null;
}
