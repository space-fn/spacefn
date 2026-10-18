import { DatabaseSync } from "node:sqlite";

import type { Dialect } from "./config";
import type { Migration } from "./migrate";
import type { QueryFile } from "./query-file";
import { splitStatements } from "./split";
export type { Dialect };

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
	type: string | number | null;
}

export interface ScratchDb {
	prepare(sql: string): Promise<{ columns(): Promise<ColumnMeta[]> }>;
	tableInfo(table: string): Promise<{ name: string; notnull: number; pk: number; type: string }[]>;
	tables(): Promise<string[]>;
}

const PG_OID: Record<number, ColumnType> = {
	16: "boolean",
	17: "bytes",
	20: "number",
	21: "number",
	23: "number",
	25: "string",
	700: "number",
	701: "number",
	1042: "string",
	1043: "string",
	1114: "string",
	1184: "string",
	1082: "string",
	1700: "number",
	2950: "string",
};

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

function fromType(type: string | number | null): ColumnType | undefined {
	if (type === null) return undefined;
	if (typeof type === "number") return PG_OID[type];
	return fromSqliteType(type);
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

export async function scratchDatabase(
	migrations: Migration[],
	dialect: Dialect = "sqlite",
): Promise<ScratchDb> {
	if (dialect === "postgres") {
		const { PGlite } = await import("@electric-sql/pglite");
		const db = new PGlite();
		for (const migration of migrations) {
			for (const statement of splitStatements(migration.sql)) await db.exec(statement);
		}
		// cache table_info per table
		const tableInfoCache = new Map<
			string,
			{ name: string; notnull: number; pk: number; type: string }[]
		>();
		async function loadTableInfo(table: string) {
			if (tableInfoCache.has(table)) return tableInfoCache.get(table)!;
			const res = await db.query(
				"SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = $1",
				[table],
			);
			const rows = res.rows as { column_name: string; is_nullable: string; data_type: string }[];
			const info = rows.map((r) => ({
				name: r.column_name,
				notnull: r.is_nullable === "NO" ? 1 : 0,
				pk: 0,
				type: r.data_type,
			}));
			tableInfoCache.set(table, info);
			return info;
		}
		return {
			async prepare(sql: string) {
				const res = await db.query(sql.replace(/;?\s*$/, "") + " LIMIT 0");
				const fields = res.fields as { name: string; dataTypeID: number }[];
				return {
					async columns() {
						return fields.map((f) => ({
							name: f.name,
							table: null,
							column: f.name,
							type: f.dataTypeID,
						}));
					},
				};
			},
			async tableInfo(table: string) {
				return loadTableInfo(table);
			},
			async tables() {
				const res = await db.query(
					"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
				);
				return (res.rows as { table_name: string }[]).map((r) => r.table_name);
			},
		};
	}
	const db = new DatabaseSync(":memory:");
	for (const migration of migrations) {
		for (const statement of splitStatements(migration.sql)) db.exec(statement);
	}
	return {
		async prepare(sql: string) {
			const stmt = db.prepare(sql);
			return {
				async columns() {
					return stmt.columns().map((m) => ({
						name: m.name,
						table: m.table ?? null,
						column: m.column ?? null,
						type: m.type ?? null,
					}));
				},
			};
		},
		async tableInfo(table: string) {
			return db.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).all() as {
				name: string;
				notnull: number;
				pk: number;
				type: string;
			}[];
		},
		async tables() {
			const rows = db
				.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
				.all() as { name: string }[];
			return rows.map((r) => r.name);
		},
	};
}

export async function inferQuery(
	scratch: ScratchDb,
	query: QueryFile,
	dialect: Dialect = "sqlite",
): Promise<InferredQuery> {
	const statement = await scratch.prepare(query.sql);
	const cols = await statement.columns();
	const outer = outerJoinedTables(query.sql);
	const isNullable = (table: string | null) =>
		outer.everything || (table !== null && outer.tables.has(table.toLowerCase()));
	const seen = new Set<string>();

	const columns: InferredColumn[] = [];
	for (const meta of cols) {
		if (seen.has(meta.name)) {
			throw new Error(`${query.name} returns "${meta.name}" twice. Alias one of them with AS.`);
		}
		seen.add(meta.name);

		const annotation = query.columns[meta.name];
		if (annotation !== undefined) {
			const parsed = ANNOTATED.exec(annotation);
			if (!parsed)
				throw new Error(`${query.name}: @column ${meta.name} has unknown type "${annotation}"`);
			columns.push({
				name: meta.name,
				type: parsed[1] as ColumnType,
				nullable: parsed[2] === "?" || isNullable(meta.table),
				source: "annotation",
			});
			continue;
		}

		const type = fromType(meta.type);
		if (type === undefined) {
			throw new Error(
				`${query.name}: column "${meta.name}" is an expression, so its type is unknown. Add "-- @column ${meta.name} <type>".`,
			);
		}
		let notNull = false;
		let integerKey = false;
		if (dialect === "sqlite" && meta.table && meta.column) {
			const info = await scratch.tableInfo(meta.table);
			const column = info.find((c) => c.name === meta.column);
			integerKey =
				column?.pk === 1 &&
				fromSqliteType(column.type) === "number" &&
				column.type.toUpperCase().includes("INT");
			notNull = column?.notnull === 1 || integerKey === true;
		}
		// For postgres, try table_info by column name (table unknown, so check all? skip; default nullable)
		columns.push({
			name: meta.name,
			type,
			nullable: !notNull || isNullable(meta.table),
			source: "schema",
		});
	}

	return { name: query.name, mode: query.mode, sql: query.sql, columns };
}
