import { templateAt } from "./templates";

/** The SQL statement around the cursor: `sql` is masked text, `start` its offset in the file. */
export interface SqlStatement {
	sql: string;
	start: number;
}

/** Tables a statement reads or writes; `aliases` maps lower-cased alias and table names to tables. */
export interface SqlScope {
	tables: string[];
	aliases: Map<string, string>;
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

/** Reads FROM/JOIN/UPDATE/INTO targets and their aliases; tolerant of half-typed SQL. */
export function scopeOf(sql: string): SqlScope {
	const tables: string[] = [];
	const aliases = new Map<string, string>();
	const add = (table: string, alias: string | undefined) => {
		if (!tables.includes(table)) tables.push(table);
		aliases.set(table.toLowerCase(), table);
		if (alias) aliases.set(alias.toLowerCase(), table);
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
	return { tables, aliases };
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

export type SqlSymbol<C extends Column> =
	| { kind: "table"; table: string }
	| { kind: "column"; matches: { table: string; column: C }[] };

/**
 * What `word` names in this statement: a table (directly or through an alias), or the columns
 * of the statement's own tables that carry that name. Tables outside the statement are never
 * consulted for columns, so `id` resolves to the table the query actually reads.
 */
export function resolveSymbol<C extends Column>(
	schema: Schema<C>,
	scope: SqlScope,
	word: string,
	qualifier: string | null,
): SqlSymbol<C> | null {
	const lower = word.toLowerCase();
	const columnsOf = (table: string) =>
		(schema.columns.get(table) ?? schema.columns.get(table.toLowerCase()) ?? [])
			.filter((c) => c.name.toLowerCase() === lower)
			.map((column) => ({ table, column }));

	if (qualifier) {
		const table = schemaTable(schema, scope.aliases.get(qualifier.toLowerCase()) ?? qualifier);
		if (!table) return null;
		const matches = columnsOf(table);
		return matches.length ? { kind: "column", matches } : null;
	}
	// An alias or a table of this statement (aliases holds both).
	const aliased = scope.aliases.get(lower);
	const inScope = aliased && schemaTable(schema, aliased);
	if (inScope) return { kind: "table", table: inScope };

	const matches = scope.tables
		.map((t) => schemaTable(schema, t))
		.filter((t): t is string => !!t)
		.flatMap(columnsOf);
	if (matches.length) return { kind: "column", matches };
	const table = schemaTable(schema, word);
	return table ? { kind: "table", table } : null;
}
