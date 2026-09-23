// --- SQL Generation ----------------------------------------------------------
// Maps ColumnDefinition to SQL DDL statements (PostgreSQL)

import type { ColumnDataType, ColumnDefinition } from "../types.js";

// --- Type Mapping ------------------------------------------------------------

/** Map ColumnDataType to SQL type string */
function sqlType(col: ColumnDefinition): string {
	const base = sqlTypeBase(col.dataType);

	// Append type args if present
	if (col.typeArgs && col.typeArgs.length > 0) {
		return `${base}(${col.typeArgs.join(", ")})`;
	}

	return base;
}

/** Base SQL type for each ColumnDataType */
function sqlTypeBase(dataType: ColumnDataType): string {
	switch (dataType) {
		case "serial":
			return "serial";
		case "integer":
			return "integer";
		case "bigint":
			return "bigint";
		case "text":
			return "text";
		case "varchar":
			return "varchar";
		case "boolean":
			return "boolean";
		case "timestamp":
			return "timestamp";
		case "date":
			return "date";
		case "time":
			return "time";
		case "decimal":
			return "decimal";
		case "real":
			return "real";
		case "double":
			return "double precision";
		case "json":
			return "json";
		case "jsonb":
			return "jsonb";
		case "uuid":
			return "uuid";
		case "blob":
			return "blob";
	}
}

// --- DDL Generation ----------------------------------------------------------

/** Quote a SQL identifier */
function q(name: string): string {
	return `"${name}"`;
}

/** Generate CREATE TABLE statement */
export function generateCreateTable(
	tableName: string,
	columns: Record<string, ColumnDefinition>,
): string {
	const lines: string[] = [];

	for (const col of Object.values(columns)) {
		const parts: string[] = [q(col.name), sqlType(col)];

		if (col.primaryKey && col.dataType !== "serial") {
			parts.push("PRIMARY KEY");
		}
		if (!col.nullable && !col.primaryKey) {
			parts.push("NOT NULL");
		}
		if (col.unique && !col.primaryKey) {
			parts.push("UNIQUE");
		}
		if (col.default && !col.primaryKey) {
			parts.push(`DEFAULT ${col.default}`);
		}
		if (col.references) {
			parts.push(`REFERENCES ${q(col.references.table)}(${q(col.references.column)})`);
		}

		lines.push(`\t${parts.join(" ")}`);
	}

	return `CREATE TABLE ${q(tableName)} (\n${lines.join(",\n")}\n);`;
}

/** Generate ALTER TABLE ADD COLUMN statement */
export function generateAddColumn(tableName: string, col: ColumnDefinition): string {
	const parts: string[] = [q(col.name), sqlType(col)];

	if (!col.nullable) {
		parts.push("NOT NULL");
	}
	if (col.unique) {
		parts.push("UNIQUE");
	}
	if (col.default) {
		parts.push(`DEFAULT ${col.default}`);
	}

	return `ALTER TABLE ${q(tableName)} ADD COLUMN ${parts.join(" ")};`;
}

/** Generate ALTER TABLE DROP COLUMN statement */
export function generateDropColumn(tableName: string, columnName: string): string {
	return `ALTER TABLE ${q(tableName)} DROP COLUMN ${q(columnName)};`;
}

/** Generate DROP TABLE statement */
export function generateDropTable(tableName: string): string {
	return `DROP TABLE ${q(tableName)};`;
}

/** Generate ALTER COLUMN type statement */
export function generateAlterColumnType(tableName: string, col: ColumnDefinition): string {
	return `ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(col.name)} TYPE ${sqlType(col)};`;
}

/** Generate ALTER COLUMN SET/DROP NOT NULL */
export function generateAlterColumnNullability(tableName: string, col: ColumnDefinition): string {
	if (col.nullable) {
		return `ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(col.name)} DROP NOT NULL;`;
	}
	return `ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(col.name)} SET NOT NULL;`;
}

/** Generate ALTER COLUMN SET/DROP DEFAULT */
export function generateAlterColumnDefault(tableName: string, col: ColumnDefinition): string {
	if (col.default) {
		return `ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(col.name)} SET DEFAULT ${col.default};`;
	}
	return `ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(col.name)} DROP DEFAULT;`;
}

/** Generate ALTER COLUMN SET/DROP UNIQUE (via CREATE/DROP INDEX) */
export function generateAlterColumnUnique(tableName: string, col: ColumnDefinition): string {
	if (col.unique) {
		return `CREATE UNIQUE INDEX ${q(`${tableName}_${col.name}_key`)} ON ${q(tableName)}(${q(col.name)});`;
	}
	return `DROP INDEX ${q(`${tableName}_${col.name}_key`)};`;
}
