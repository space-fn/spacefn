import { type ColumnDef } from "./column.js";
import { type SchemaDef, getColumns, getIndexes } from "./schema-types.js";

const T = "\t";

/**
 * Generates a Kysely-compatible migration file from a schema definition.
 *
 * The migration creates all tables defined in the schema.
 * For incremental changes, a schema cache is used to diff old vs new.
 */
export function generateMigration(schema: SchemaDef, _migrationName: string): string {
	const lines: string[] = [];

	lines.push(`import { type Kysely, sql } from "kysely"`);
	lines.push("");
	lines.push(`export async function up(db: Kysely<any>): Promise<void> {`);

	for (const [tableName, tableDef] of Object.entries(schema)) {
		const columns = getColumns(tableDef);
		const indexes = getIndexes(tableDef);

		// createTable
		lines.push(`${T}await db.schema`);
		lines.push(`${T}${T}.createTable("${tableName}")`);

		for (const [colName, colDef] of Object.entries(columns)) {
			const modifiers: string[] = [];
			if (colDef.primaryKey) modifiers.push("primaryKey()");
			if (colDef.autoIncrement) modifiers.push("autoIncrement()");
			if (colDef.notNull && !colDef.primaryKey) modifiers.push("notNull()");
			if (colDef.unique && !colDef.primaryKey) modifiers.push("unique()");
			if (colDef.default !== undefined) modifiers.push(`defaultTo(${mapDefault(colDef)})`);
			if (colDef.references) modifiers.push(`references("${colDef.references}")`);

			if (modifiers.length > 0) {
				lines.push(
					`${T}${T}.addColumn("${colName}", "${mapSqlType(colDef)}", (col) => col.${modifiers.join(".")})`,
				);
			} else {
				lines.push(`${T}${T}.addColumn("${colName}", "${mapSqlType(colDef)}")`);
			}
		}

		lines.push(`${T}${T}.execute()`);

		// Indexes
		for (const idx of indexes) {
			lines.push("");
			lines.push(`${T}await db.schema`);
			lines.push(`${T}${T}.createIndex("${idx.name}")`);
			lines.push(`${T}${T}.on("${tableName}")`);

			if (idx.options?.unique) {
				lines.push(`${T}${T}.unique()`);
			}

			lines.push(`${T}${T}.column("${idx.columns[0]}")`);
			lines.push(`${T}${T}.execute()`);
		}
	}

	lines.push(`}`);
	lines.push("");
	lines.push(`export async function down(db: Kysely<any>): Promise<void> {`);

	// Drop tables in reverse order
	const tableNames = Object.keys(schema);
	for (let i = tableNames.length - 1; i >= 0; i--) {
		lines.push(`${T}await db.schema.dropTable("${tableNames[i]}").execute()`);
	}

	lines.push(`}`);
	lines.push("");

	return lines.join("\n");
}

/**
 * Generate an incremental migration that adds/modifies tables.
 * Compares oldSchema vs newSchema and generates only the diff.
 */
export function generateIncrementalMigration(
	oldSchema: SchemaDef | null,
	newSchema: SchemaDef,
	_migrationName: string,
): string {
	const lines: string[] = [];

	lines.push(`import { type Kysely, sql } from "kysely"`);
	lines.push("");
	lines.push(`export async function up(db: Kysely<any>): Promise<void> {`);

	const oldTables = oldSchema ? Object.keys(oldSchema) : [];
	const newTables = Object.keys(newSchema);

	// Added tables
	for (const tableName of newTables) {
		if (!oldTables.includes(tableName)) {
			const tableDef = newSchema[tableName];
			lines.push(...generateCreateTable(tableName, tableDef));
		}
	}

	// Modified tables (added columns)
	for (const tableName of newTables) {
		if (oldTables.includes(tableName)) {
			const oldTable = oldSchema![tableName];
			const newTable = newSchema[tableName];
			lines.push(...generateAlterTable(tableName, oldTable, newTable));
		}
	}

	lines.push(`}`);
	lines.push("");
	lines.push(`export async function down(db: Kysely<any>): Promise<void> {`);

	// Removed tables (reverse order)
	for (let i = newTables.length - 1; i >= 0; i--) {
		const tableName = newTables[i];
		if (!oldTables.includes(tableName)) {
			lines.push(`${T}await db.schema.dropTable("${tableName}").execute()`);
		}
	}

	lines.push(`}`);
	lines.push("");

	return lines.join("\n");
}

function* generateCreateTable(tableName: string, tableDef: any): Generator<string> {
	const columns = getColumns(tableDef);
	const indexes = getIndexes(tableDef);

	yield `${T}await db.schema`;
	yield `${T}${T}.createTable("${tableName}")`;

	for (const [colName, colDef] of Object.entries(columns)) {
		const modifiers: string[] = [];
		if (colDef.primaryKey) modifiers.push("primaryKey()");
		if (colDef.autoIncrement) modifiers.push("autoIncrement()");
		if (colDef.notNull && !colDef.primaryKey) modifiers.push("notNull()");
		if (colDef.unique && !colDef.primaryKey) modifiers.push("unique()");
		if (colDef.default !== undefined)
			modifiers.push(`defaultTo(${mapDefault(colDef as ColumnDef)})`);
		if (colDef.references) modifiers.push(`references("${colDef.references}")`);

		if (modifiers.length > 0) {
			yield `${T}${T}.addColumn("${colName}", "${mapSqlType(colDef as ColumnDef)}", (col) => col.${modifiers.join(".")})`;
		} else {
			yield `${T}${T}.addColumn("${colName}", "${mapSqlType(colDef as ColumnDef)}")`;
		}
	}

	yield `${T}${T}.execute()`;

	for (const idx of indexes) {
		yield "";
		yield `${T}await db.schema`;
		yield `${T}${T}.createIndex("${idx.name}")`;
		yield `${T}${T}.on("${tableName}")`;

		if (idx.options?.unique) {
			yield `${T}${T}.unique()`;
		}

		yield `${T}${T}.column("${idx.columns[0]}")`;
		yield `${T}${T}.execute()`;
	}
}

function* generateAlterTable(tableName: string, oldTable: any, newTable: any): Generator<string> {
	const oldColumns = getColumns(oldTable);
	const newColumns = getColumns(newTable);

	// Find added columns
	for (const [colName, colDef] of Object.entries(newColumns)) {
		if (!(colName in oldColumns)) {
			yield `${T}await db.schema`;
			yield `${T}${T}.alterTable("${tableName}")`;

			const modifiers: string[] = [];
			if (colDef.notNull) modifiers.push("notNull()");
			if (colDef.unique) modifiers.push("unique()");
			if (colDef.default !== undefined) modifiers.push(`defaultTo(${mapDefault(colDef)})`);

			if (modifiers.length > 0) {
				yield `${T}${T}.addColumn("${colName}", "${mapSqlType(colDef)}", (col) => col.${modifiers.join(".")})`;
			} else {
				yield `${T}${T}.addColumn("${colName}", "${mapSqlType(colDef)}")`;
			}

			yield `${T}${T}.execute()`;
		}
	}
}

function mapSqlType(col: ColumnDef): string {
	switch (col.type) {
		case "text":
			return "text";
		case "integer":
			return "integer";
		case "real":
			return "real";
		case "blob":
			return "blob";
		case "json":
			return "text";
		default:
			return "text";
	}
}

function mapDefault(col: ColumnDef): string {
	if (col.default === undefined) return "";

	const val = col.default;
	if (typeof val === "string") {
		// SQL expressions
		if (val === "CURRENT_TIMESTAMP" || val.includes("(")) {
			return `sql\`${val}\``;
		}
		return `"${val}"`;
	}
	if (typeof val === "number") return `${val}`;
	if (typeof val === "boolean") return val ? "1" : "0";
	return `"${String(val)}"`;
}

/**
 * Generate a timestamp-based migration name.
 * Format: YYYYMMDDHHMMSS_descriptive_name
 */
export function generateMigrationName(description: string): string {
	const now = new Date();
	const pad = (n: number) => n.toString().padStart(2, "0");
	const ts = [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
		pad(now.getHours()),
		pad(now.getMinutes()),
		pad(now.getSeconds()),
	].join("");

	const slug = description
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_|_$/g, "");

	return `${ts}_${slug}`;
}
