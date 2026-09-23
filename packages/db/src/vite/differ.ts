// --- Schema Differ ------------------------------------------------------------
// Compares two schema snapshots and produces a list of changes

import type { DatabaseSchema, TableDefinition, ColumnDefinition } from "../types.js";

// --- Change Types ------------------------------------------------------------

export interface TableAdded {
	type: "table_added";
	table: string;
	definition: TableDefinition;
}

export interface TableDropped {
	type: "table_dropped";
	table: string;
}

export interface ColumnAdded {
	type: "column_added";
	table: string;
	column: ColumnDefinition;
}

export interface ColumnDropped {
	type: "column_dropped";
	table: string;
	column: string;
}

export interface ColumnChanged {
	type: "column_changed";
	table: string;
	column: string;
	before: ColumnDefinition;
	after: ColumnDefinition;
}

export type SchemaChange = TableAdded | TableDropped | ColumnAdded | ColumnDropped | ColumnChanged;

// --- Diffing -----------------------------------------------------------------

/** Diff two schemas, returns list of changes */
export function diffSchemas(before: DatabaseSchema, after: DatabaseSchema): SchemaChange[] {
	const changes: SchemaChange[] = [];

	const beforeKeys = new Set(Object.keys(before));
	const afterKeys = new Set(Object.keys(after));

	// New tables
	for (const tableName of afterKeys) {
		if (!beforeKeys.has(tableName)) {
			changes.push({
				type: "table_added",
				table: tableName,
				definition: after[tableName],
			});
		}
	}

	// Dropped tables
	for (const tableName of beforeKeys) {
		if (!afterKeys.has(tableName)) {
			changes.push({
				type: "table_dropped",
				table: tableName,
			});
		}
	}

	// Changed tables (columns added/dropped/modified)
	for (const tableName of beforeKeys) {
		if (!afterKeys.has(tableName)) continue;

		const beforeTable = before[tableName];
		const afterTable = after[tableName];
		changes.push(...diffColumns(tableName, beforeTable, afterTable));
	}

	return changes;
}

/** Diff columns between two table definitions */
function diffColumns(
	tableName: string,
	before: TableDefinition,
	after: TableDefinition,
): SchemaChange[] {
	const changes: SchemaChange[] = [];
	const beforeCols = new Set(Object.keys(before.columns));
	const afterCols = new Set(Object.keys(after.columns));

	// New columns
	for (const colName of afterCols) {
		if (!beforeCols.has(colName)) {
			changes.push({
				type: "column_added",
				table: tableName,
				column: after.columns[colName],
			});
		}
	}

	// Dropped columns
	for (const colName of beforeCols) {
		if (!afterCols.has(colName)) {
			changes.push({
				type: "column_dropped",
				table: tableName,
				column: colName,
			});
		}
	}

	// Modified columns
	for (const colName of beforeCols) {
		if (!afterCols.has(colName)) continue;

		const beforeCol = before.columns[colName];
		const afterCol = after.columns[colName];

		if (!columnsEqual(beforeCol, afterCol)) {
			changes.push({
				type: "column_changed",
				table: tableName,
				column: colName,
				before: beforeCol,
				after: afterCol,
			});
		}
	}

	return changes;
}

/** Check if two column definitions are equal */
function columnsEqual(a: ColumnDefinition, b: ColumnDefinition): boolean {
	return (
		a.name === b.name &&
		a.dataType === b.dataType &&
		a.nullable === b.nullable &&
		a.primaryKey === b.primaryKey &&
		a.unique === b.unique &&
		a.default === b.default &&
		JSON.stringify(a.typeArgs) === JSON.stringify(b.typeArgs) &&
		JSON.stringify(a.references) === JSON.stringify(b.references)
	);
}

/** Check if there are any changes */
export function hasChanges(changes: SchemaChange[]): boolean {
	return changes.length > 0;
}
