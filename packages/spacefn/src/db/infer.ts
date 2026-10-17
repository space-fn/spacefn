import { DatabaseSync } from "node:sqlite";

import type { Migration } from "./migrate";
import type { QueryFile } from "./query-file";
import { splitStatements } from "./split";

/** A TypeScript type for a column, written in the query file's vocabulary. */
export type ColumnType = "string" | "number" | "boolean" | "bytes" | "unknown";

export interface InferredColumn {
	name: string;
	type: ColumnType;
	nullable: boolean;
	/** Where the type came from: the schema, or an annotation the file gave. */
	source: "schema" | "annotation";
}

export interface InferredQuery {
	name: string;
	mode: QueryFile["mode"];
	sql: string;
	columns: InferredColumn[];
}

/** Builds an in-memory SQLite with every migration applied. The schema source for inference. */
export function scratchDatabase(migrations: Migration[]): DatabaseSync {
	const db = new DatabaseSync(":memory:");
	for (const migration of migrations) {
		for (const statement of splitStatements(migration.sql)) db.exec(statement);
	}
	return db;
}

/** Maps a SQLite declared type to a column type, following SQLite's affinity rules. */
function fromDeclared(declared: string): ColumnType | undefined {
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

/**
 * Tables on the nullable side of an outer join. A RIGHT or FULL join can make
 * any column null, so those queries mark every column nullable.
 */
function outerJoinedTables(sql: string): { tables: Set<string>; everything: boolean } {
	const tables = new Set<string>();
	for (const match of sql.matchAll(/LEFT\s+(?:OUTER\s+)?JOIN\s+([A-Za-z_]\w*)/gi)) {
		tables.add((match[1] as string).toLowerCase());
	}
	const everything = /\b(?:RIGHT|FULL)\s+(?:OUTER\s+)?JOIN\b/i.test(sql);
	return { tables, everything };
}

/**
 * Describes the result columns of a query against the migrated schema. Column
 * references get their type and nullability from the schema. Expressions need
 * an `@column` annotation, because SQLite does not report their type. Throws
 * when a column is neither in the schema nor annotated.
 */
export function inferQuery(scratch: DatabaseSync, query: QueryFile): InferredQuery {
	const statement = scratch.prepare(query.sql);
	const outer = outerJoinedTables(query.sql);
	const isNullable = (table: string | null) =>
		outer.everything || (table !== null && outer.tables.has(table.toLowerCase()));
	const seen = new Set<string>();

	const columns: InferredColumn[] = statement.columns().map((meta) => {
		if (seen.has(meta.name)) {
			throw new Error(`${query.name} returns "${meta.name}" twice. Alias one of them with AS.`);
		}
		seen.add(meta.name);

		const annotation = query.columns[meta.name];
		if (annotation !== undefined) {
			const parsed = ANNOTATED.exec(annotation);
			if (!parsed)
				throw new Error(`${query.name}: @column ${meta.name} has unknown type "${annotation}"`);
			return {
				name: meta.name,
				type: parsed[1] as ColumnType,
				nullable: parsed[2] === "?" || isNullable(meta.table),
				source: "annotation",
			};
		}

		if (meta.table === null || meta.column === null || meta.type === null) {
			throw new Error(
				`${query.name}: column "${meta.name}" is an expression, so its type is unknown. Add "-- @column ${meta.name} <type>".`,
			);
		}
		const type = fromDeclared(meta.type);
		if (type === undefined) {
			throw new Error(
				`${query.name}: column "${meta.name}" has no usable type. Add "-- @column ${meta.name} <type>".`,
			);
		}
		const info = scratch
			.prepare(`PRAGMA table_info("${meta.table.replaceAll('"', '""')}")`)
			.all() as { name: string; notnull: number; pk: number; type: string }[];
		const column = info.find((c) => c.name === meta.column);
		const integerKey =
			column?.pk === 1 &&
			fromDeclared(column.type) === "number" &&
			column.type.toUpperCase().includes("INT");
		const notNull = column?.notnull === 1 || integerKey === true;
		return {
			name: meta.name,
			type,
			nullable: !notNull || isNullable(meta.table),
			source: "schema",
		};
	});

	return { name: query.name, mode: query.mode, sql: query.sql, columns };
}
