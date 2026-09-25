// --- SQL DDL Generation -------------------------------------------------------
// Maps ColumnDefinition to SQL DDL statements
// Supports: postgres, mysql, sqlite

import type { ColumnDefinition, TableDefinition } from "../types.js";

/** Supported SQL dialects */
export type Dialect = "postgres" | "mysql" | "sqlite";

// --- Identifier Quoting ------------------------------------------------------

function q(name: string, dialect: Dialect): string {
	switch (dialect) {
		case "postgres":
			return `"${name}"`;
		case "mysql":
			return `\`${name}\``;
		case "sqlite":
			return `"${name}"`;
	}
}

// --- Type Mapping (per dialect) ----------------------------------------------

function sqlType(col: ColumnDefinition, dialect: Dialect): string {
	if (col.dataType === "enum") {
		// ENUM → VARCHAR with CHECK constraint (handled separately)
		return dialect === "mysql" ? "VARCHAR(255)" : "VARCHAR(255)";
	}
	if (col.dataType === "varchar" && col.length) {
		return `VARCHAR(${col.length})`;
	}
	return sqlTypeBase(col.dataType, dialect);
}

function sqlTypeBase(dataType: ColumnDefinition["dataType"], dialect: Dialect): string {
	switch (dataType) {
		case "serial":
			return dialect === "mysql" ? "INTEGER NOT NULL AUTO_INCREMENT" : "SERIAL";
		case "integer":
			return "INTEGER";
		case "text":
			return "TEXT";
		case "varchar":
			return "VARCHAR(255)";
		case "boolean":
			return dialect === "sqlite" ? "INTEGER" : "BOOLEAN";
		case "timestamp":
			return dialect === "mysql" ? "DATETIME" : "TIMESTAMP";
		case "json":
			return dialect === "postgres" ? "JSONB" : "JSON";
		default:
			return "TEXT";
	}
}

// --- Default Value -----------------------------------------------------------

function defaultValue(col: ColumnDefinition, dialect: Dialect): string {
	if (col.default === undefined) return "";
	if (col.default === "auto") {
		if (col.dataType === "serial") return "";
		if (col.dataType === "timestamp") {
			return dialect === "mysql" ? " DEFAULT CURRENT_TIMESTAMP" : " DEFAULT NOW()";
		}
		return "";
	}
	// SQL expression (e.g., "now()", "'user'", "TRUE")
	if (
		col.default.startsWith("'") ||
		col.default === "TRUE" ||
		col.default === "FALSE" ||
		col.default === "NULL"
	) {
		return ` DEFAULT ${col.default}`;
	}
	// Check if it looks like a function call
	if (col.default.endsWith("()")) {
		return ` DEFAULT ${col.default}`;
	}
	// Otherwise wrap in quotes as a string literal
	return ` DEFAULT '${col.default}'`;
}

// --- DDL Generation ----------------------------------------------------------

/** Generate CREATE TABLE statement */
export function generateCreateTable(table: TableDefinition, dialect: Dialect = "postgres"): string {
	const lines: string[] = [];

	for (const [colName, col] of Object.entries(table.columns)) {
		const parts: string[] = [q(colName, dialect)];

		// SERIAL is special — type includes AUTO_INCREMENT on MySQL
		if (col.dataType === "serial" && dialect === "mysql") {
			parts.push("INTEGER NOT NULL AUTO_INCREMENT");
		} else if (col.dataType === "serial") {
			parts.push("SERIAL");
		} else {
			parts.push(sqlType(col, dialect));
		}

		// NOT NULL (serial is always NOT NULL)
		if (!col.nullable && col.dataType !== "serial") {
			parts.push("NOT NULL");
		}

		// UNIQUE
		if (col.unique) {
			parts.push("UNIQUE");
		}

		// DEFAULT
		const def = defaultValue(col, dialect);
		if (def) parts.push(def.trim());

		// PRIMARY KEY
		if (col.dataType === "serial") {
			parts.push("PRIMARY KEY");
		}

		lines.push(`  ${parts.join(" ")}`);
	}

	// Foreign keys as table constraints
	const fks: string[] = [];
	for (const [colName, col] of Object.entries(table.columns)) {
		if (col.references) {
			const [refTable, refColumn] = col.references;
			fks.push(
				`  FOREIGN KEY (${q(colName, dialect)}) REFERENCES ${q(refTable, dialect)}(${q(refColumn, dialect)})`,
			);
		}
	}

	// Enum CHECK constraints
	for (const [colName, col] of Object.entries(table.columns)) {
		if (col.dataType === "enum" && col.enumValues) {
			const check = col.enumValues.map((v) => `'${v}'`).join(", ");
			fks.push(`  CHECK (${q(colName, dialect)} IN (${check}))`);
		}
	}

	const allLines = [...lines, ...fks];
	return `CREATE TABLE ${q(table.name, dialect)} (\n${allLines.join(",\n")}\n)`;
}

/** Generate ALTER TABLE ADD COLUMN statement */
export function generateAddColumn(
	tableName: string,
	colName: string,
	col: ColumnDefinition,
	dialect: Dialect = "postgres",
): string {
	const parts: string[] = [q(colName, dialect)];

	if (col.dataType === "serial") {
		parts.push(dialect === "mysql" ? "INTEGER NOT NULL AUTO_INCREMENT" : "SERIAL");
	} else {
		parts.push(sqlType(col, dialect));
	}

	if (!col.nullable) parts.push("NOT NULL");
	if (col.unique) parts.push("UNIQUE");

	const def = defaultValue(col, dialect);
	if (def) parts.push(def.trim());

	return `ALTER TABLE ${q(tableName, dialect)} ADD COLUMN ${parts.join(" ")}`;
}

/** Generate ALTER TABLE DROP COLUMN statement */
export function generateDropColumn(
	tableName: string,
	columnName: string,
	dialect: Dialect = "postgres",
): string {
	return `ALTER TABLE ${q(tableName, dialect)} DROP COLUMN ${q(columnName, dialect)}`;
}

/** Generate DROP TABLE statement */
export function generateDropTable(tableName: string, dialect: Dialect = "postgres"): string {
	return `DROP TABLE ${q(tableName, dialect)}`;
}

/** Generate ALTER COLUMN SET/DROP NOT NULL */
export function generateAlterColumnNullability(
	tableName: string,
	colName: string,
	col: ColumnDefinition,
	dialect: Dialect = "postgres",
): string {
	if (dialect === "sqlite") {
		// SQLite doesn't support ALTER COLUMN — would need table rebuild
		// For now, return a comment
		return `-- SQLite: Cannot alter nullability of ${colName} on ${tableName}`;
	}
	const action = col.nullable ? "DROP NOT NULL" : "SET NOT NULL";
	return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(colName, dialect)} ${action}`;
}

/** Generate ALTER COLUMN SET/DROP DEFAULT */
export function generateAlterColumnDefault(
	tableName: string,
	colName: string,
	col: ColumnDefinition,
	dialect: Dialect = "postgres",
): string {
	if (dialect === "sqlite") {
		return `-- SQLite: Cannot alter default of ${colName} on ${tableName}`;
	}
	if (col.default === undefined) {
		return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(colName, dialect)} DROP DEFAULT`;
	}
	return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(colName, dialect)} SET DEFAULT ${col.default}`;
}

/** Generate ALTER COLUMN TYPE */
export function generateAlterColumnType(
	tableName: string,
	colName: string,
	col: ColumnDefinition,
	dialect: Dialect = "postgres",
): string {
	if (dialect === "sqlite") {
		return `-- SQLite: Cannot alter type of ${colName} on ${tableName}`;
	}
	return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(colName, dialect)} TYPE ${sqlType(col, dialect)}`;
}
