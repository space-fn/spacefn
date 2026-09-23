// --- SQL Generation ----------------------------------------------------------
// Maps ColumnDefinition to SQL DDL statements with dialect support
// Supports: postgres, mysql, sqlite

import type { ColumnDataType, ColumnDefinition } from "../types.js";

/** Supported SQL dialects */
export type Dialect = "postgres" | "mysql" | "sqlite";

// --- Identifier Quoting ------------------------------------------------------

/** Quote identifier based on dialect */
function q(name: string, dialect: Dialect): string {
	switch (dialect) {
		case "mysql":
			return `\`${name}\``;
		case "postgres":
		case "sqlite":
			return `"${name}"`;
	}
}

// --- Type Mapping (per dialect) ----------------------------------------------

/** Map ColumnDataType to SQL type string */
function sqlType(col: ColumnDefinition, dialect: Dialect): string {
	const base = sqlTypeBase(col.dataType, dialect);

	if (col.typeArgs && col.typeArgs.length > 0) {
		return `${base}(${col.typeArgs.join(", ")})`;
	}

	return base;
}

/** Base SQL type for each ColumnDataType per dialect */
function sqlTypeBase(dataType: ColumnDataType, dialect: Dialect): string {
	switch (dialect) {
		case "sqlite":
			return sqliteType(dataType);
		case "mysql":
			return mysqlType(dataType);
		case "postgres":
			return postgresType(dataType);
	}
}

function postgresType(dataType: ColumnDataType): string {
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
			return "bytea";
	}
}

function mysqlType(dataType: ColumnDataType): string {
	switch (dataType) {
		case "serial":
			return "int";
		case "integer":
			return "int";
		case "bigint":
			return "bigint";
		case "text":
			return "text";
		case "varchar":
			return "varchar";
		case "boolean":
			return "tinyint";
		case "timestamp":
			return "timestamp";
		case "date":
			return "date";
		case "time":
			return "time";
		case "decimal":
			return "decimal";
		case "real":
			return "float";
		case "double":
			return "double";
		case "json":
			return "json";
		case "jsonb":
			return "json";
		case "uuid":
			return "char";
		case "blob":
			return "blob";
	}
}

function sqliteType(dataType: ColumnDataType): string {
	switch (dataType) {
		case "serial":
		case "integer":
		case "bigint":
			return "integer";
		case "text":
		case "varchar":
			return "text";
		case "boolean":
			return "integer";
		case "timestamp":
		case "date":
		case "time":
			return "text";
		case "decimal":
		case "real":
		case "double":
			return "real";
		case "json":
		case "jsonb":
			return "text";
		case "uuid":
			return "text";
		case "blob":
			return "blob";
	}
}

// --- DDL Generation ----------------------------------------------------------

/** Generate CREATE TABLE statement */
export function generateCreateTable(
	tableName: string,
	columns: Record<string, ColumnDefinition>,
	dialect: Dialect = "postgres",
): string {
	const lines: string[] = [];

	for (const col of Object.values(columns)) {
		const parts: string[] = [];

		if (col.dataType === "serial" && dialect === "mysql") {
			// MySQL: serial → INT AUTO_INCREMENT PRIMARY KEY
			parts.push(q(col.name, dialect), "int", "AUTO_INCREMENT", "PRIMARY KEY");
		} else if (col.dataType === "serial" && dialect === "sqlite") {
			// SQLite: serial → INTEGER PRIMARY KEY AUTOINCREMENT
			parts.push(q(col.name, dialect), "integer", "primary key", "autoincrement");
		} else if (col.dataType === "serial") {
			// PostgreSQL: serial (implicit auto-increment)
			parts.push(q(col.name, dialect), "serial");
		} else {
			parts.push(q(col.name, dialect), sqlType(col, dialect));

			if (col.primaryKey) {
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
				parts.push(
					`REFERENCES ${q(col.references.table, dialect)}(${q(col.references.column, dialect)})`,
				);
			}
		}

		lines.push(`\t${parts.join(" ")}`);
	}

	return `CREATE TABLE ${q(tableName, dialect)} (\n${lines.join(",\n")}\n);`;
}

/** Generate ALTER TABLE ADD COLUMN statement */
export function generateAddColumn(
	tableName: string,
	col: ColumnDefinition,
	dialect: Dialect = "postgres",
): string {
	const parts: string[] = [q(col.name, dialect), sqlType(col, dialect)];

	if (!col.nullable) {
		parts.push("NOT NULL");
	}
	if (col.unique) {
		parts.push("UNIQUE");
	}
	if (col.default) {
		parts.push(`DEFAULT ${col.default}`);
	}

	return `ALTER TABLE ${q(tableName, dialect)} ADD COLUMN ${parts.join(" ")};`;
}

/** Generate ALTER TABLE DROP COLUMN statement */
export function generateDropColumn(
	tableName: string,
	columnName: string,
	dialect: Dialect = "postgres",
): string {
	return `ALTER TABLE ${q(tableName, dialect)} DROP COLUMN ${q(columnName, dialect)};`;
}

/** Generate DROP TABLE statement */
export function generateDropTable(tableName: string, dialect: Dialect = "postgres"): string {
	return `DROP TABLE ${q(tableName, dialect)};`;
}

/** Generate ALTER COLUMN type statement */
export function generateAlterColumnType(
	tableName: string,
	col: ColumnDefinition,
	dialect: Dialect = "postgres",
): string {
	if (dialect === "mysql") {
		return `ALTER TABLE ${q(tableName, dialect)} MODIFY COLUMN ${q(col.name, dialect)} ${sqlType(col, dialect)};`;
	}
	if (dialect === "sqlite") {
		// SQLite doesn't support ALTER COLUMN TYPE — would need recreate table
		return `-- SQLite: ALTER COLUMN TYPE not supported, recreate table instead`;
	}
	return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(col.name, dialect)} TYPE ${sqlType(col, dialect)};`;
}

/** Generate ALTER COLUMN SET/DROP NOT NULL */
export function generateAlterColumnNullability(
	tableName: string,
	col: ColumnDefinition,
	dialect: Dialect = "postgres",
): string {
	if (dialect === "mysql") {
		// MySQL uses MODIFY COLUMN
		const nullStr = col.nullable ? "NULL" : "NOT NULL";
		return `ALTER TABLE ${q(tableName, dialect)} MODIFY COLUMN ${q(col.name, dialect)} ${sqlType(col, dialect)} ${nullStr};`;
	}
	if (dialect === "sqlite") {
		// SQLite doesn't support ALTER COLUMN NOT NULL
		return `-- SQLite: ALTER COLUMN NOT NULL not supported, recreate table instead`;
	}
	if (col.nullable) {
		return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(col.name, dialect)} DROP NOT NULL;`;
	}
	return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(col.name, dialect)} SET NOT NULL;`;
}

/** Generate ALTER COLUMN SET/DROP DEFAULT */
export function generateAlterColumnDefault(
	tableName: string,
	col: ColumnDefinition,
	dialect: Dialect = "postgres",
): string {
	if (dialect === "mysql") {
		if (col.default) {
			return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(col.name, dialect)} SET DEFAULT ${col.default};`;
		}
		return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(col.name, dialect)} DROP DEFAULT;`;
	}
	if (col.default) {
		return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(col.name, dialect)} SET DEFAULT ${col.default};`;
	}
	return `ALTER TABLE ${q(tableName, dialect)} ALTER COLUMN ${q(col.name, dialect)} DROP DEFAULT;`;
}

/** Generate ALTER COLUMN SET/DROP UNIQUE (via CREATE/DROP INDEX) */
export function generateAlterColumnUnique(
	tableName: string,
	col: ColumnDefinition,
	dialect: Dialect = "postgres",
): string {
	const indexName = `${tableName}_${col.name}_key`;
	if (col.unique) {
		return `CREATE UNIQUE INDEX ${q(indexName, dialect)} ON ${q(tableName, dialect)}(${q(col.name, dialect)});`;
	}
	if (dialect === "mysql") {
		return `DROP INDEX ${q(indexName, dialect)} ON ${q(tableName, dialect)};`;
	}
	return `DROP INDEX ${q(indexName, dialect)};`;
}
