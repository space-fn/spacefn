import { SqlError } from "./error.ts";
import { namedParams } from "./params.ts";
import { parseQueryFile, type QueryFile } from "./query-file.ts";

export type ColumnType = "string" | "number" | "boolean" | "bytes" | "unknown";

export interface InferredColumn {
	name: string;
	type: ColumnType;
	nullable: boolean;
	source: "schema" | "annotation";
}

export interface InferredQuery {
	name: string;
	mode: QueryFile["mode"];
	sql: string;
	columns: InferredColumn[];
}

export interface ColumnMeta {
	name: string;
	table: string | null;
	column: string | null;
	type: string | null;
}

export interface TableColumn {
	name: string;
	notnull: number;
	pk: number;
	type: string;
}

/**
 * A migrated SQLite schema to check queries against. `spacefn/sql/node` has one
 * on `node:sqlite`; any SQLite that reports result-column origins works.
 */
export interface ScratchDb {
	prepare(sql: string): Promise<{ columns(): Promise<ColumnMeta[]> }>;
	tableInfo(table: string): Promise<TableColumn[]>;
	tables(): Promise<string[]>;
}

function fromSqliteType(declared: string): ColumnType | undefined {
	const type = declared.toUpperCase();
	if (type.includes("INT")) return "number";
	if (type.includes("CHAR") || type.includes("CLOB") || type.includes("TEXT")) return "string";
	if (type.includes("BLOB")) return "bytes";
	if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) return "number";
	if (type === "BOOLEAN") return "boolean";
	if (type.includes("NUM") || type.includes("DEC")) return "number";
	return undefined;
}

const ANNOTATED = /^(string|number|boolean|bytes|unknown)(\?)?$/;

function outerJoinedTables(sql: string): { tables: Set<string>; everything: boolean } {
	const tables = new Set<string>();
	for (const match of sql.matchAll(/LEFT\s+(?:OUTER\s+)?JOIN\s+([A-Za-z_]\w*)/gi)) {
		tables.add((match[1] as string).toLowerCase());
	}
	const everything = /\b(?:RIGHT|FULL)\s+(?:OUTER\s+)?JOIN\b/i.test(sql);
	return { tables, everything };
}

/** Works out each result column's type and nullability from the schema and `@column` annotations. */
export async function inferQuery(scratch: ScratchDb, query: QueryFile): Promise<InferredQuery> {
	const statement = await scratch.prepare(query.sql);
	const cols = await statement.columns();
	const outer = outerJoinedTables(query.sql);
	const isNullable = (table: string | null) =>
		outer.everything || (table !== null && outer.tables.has(table.toLowerCase()));
	const seen = new Set<string>();

	const columns: InferredColumn[] = [];
	for (const meta of cols) {
		if (seen.has(meta.name)) {
			throw new SqlError("INFER_DUP_COLUMN", `${query.name} returns "${meta.name}" twice`, {
				hint: "Alias one of them with AS.",
			});
		}
		seen.add(meta.name);

		const annotation = query.columns[meta.name];
		if (annotation !== undefined) {
			const parsed = ANNOTATED.exec(annotation);
			if (!parsed)
				throw new SqlError(
					"INFER_BAD_TYPE",
					`${query.name}: @column ${meta.name} has unknown type "${annotation}"`,
					{ hint: "Use string, number, boolean, bytes or unknown, with ? for nullable." },
				);
			columns.push({
				name: meta.name,
				type: parsed[1] as ColumnType,
				nullable: parsed[2] === "?" || isNullable(meta.table),
				source: "annotation",
			});
			continue;
		}

		const type = meta.type === null ? undefined : fromSqliteType(meta.type);
		if (type === undefined) {
			throw new SqlError("INFER_EXPR", `${query.name}: column "${meta.name}" is an expression`, {
				hint: `Add "-- @column ${meta.name} <type>".`,
			});
		}
		let notNull = false;
		if (meta.table && meta.column) {
			const info = await scratch.tableInfo(meta.table);
			const column = info.find((c) => c.name === meta.column);
			const integerKey =
				column?.pk === 1 &&
				fromSqliteType(column.type) === "number" &&
				column.type.toUpperCase().includes("INT");
			notNull = column?.notnull === 1 || integerKey;
		}
		columns.push({
			name: meta.name,
			type,
			nullable: !notNull || isNullable(meta.table),
			source: "schema",
		});
	}

	return { name: query.name, mode: query.mode, sql: query.sql, columns };
}

export interface AnalyzedQuery extends InferredQuery {
	/** Parameter names in placeholder order, for binding. */
	paramNames: string[];
	/** Declared types for parameters, from `@param` lines. */
	paramTypes: Record<string, string>;
	/** The SQL with `?` placeholders, as sent to the database. */
	boundSql: string;
	/** Ordered parts; `gate` null means always included. */
	parts: { sql: string; paramNames: string[]; gate: string[] | null }[];
}

/**
 * Parses a query file and checks it against the schema: with every conditional
 * part included (for the column types) and with all of them excluded (so the
 * base query is valid on its own).
 */
export async function analyzeQuery(
	scratch: ScratchDb,
	file: string,
	text: string,
): Promise<AnalyzedQuery> {
	const parsed = parseQueryFile(file, text);
	const { sql: boundSql, names } = namedParams(parsed.sql);
	const inferred = await inferQuery(scratch, { ...parsed, sql: boundSql }).catch((cause) => {
		if (cause instanceof SqlError) {
			if (cause.file) throw cause;
			throw new SqlError(cause.code, cause.message, { file, hint: cause.hint, cause });
		}
		throw new SqlError("QUERY_INVALID", `${parsed.name}: ${(cause as Error).message}`, {
			file,
			hint: "Check the SQL against the tables in your migrations.",
			cause,
		});
	});
	const base = parsed.parts
		.filter((p) => p.gate === null)
		.map((p) => p.sql)
		.join("\n");
	try {
		await scratch.prepare(namedParams(base).sql);
	} catch (cause) {
		throw new SqlError(
			"QUERY_INVALID",
			`${parsed.name}: base (all conditionals excluded) SQL is invalid: ${(cause as Error).message}`,
			{ file, hint: "Check the SQL outside the -- case blocks.", cause },
		);
	}
	return {
		...inferred,
		sql: parsed.sql,
		boundSql,
		paramNames: names,
		paramTypes: parsed.params,
		parts: parsed.parts.map((p) => {
			const r = namedParams(p.sql);
			return { sql: r.sql, paramNames: r.names, gate: p.gate };
		}),
	};
}
