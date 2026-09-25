// --- Schema Differ ------------------------------------------------------------
// Compares two schema snapshots and produces a list of changes

import type { ColumnDefinition, DatabaseSchema, TableDefinition } from "../types.js";

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
	column: string;
	definition: ColumnDefinition;
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

	// Tables added
	for (const [name, definition] of Object.entries(after)) {
		if (!(name in before)) {
			changes.push({ type: "table_added", table: name, definition });
		}
	}

	// Tables dropped
	for (const name of Object.keys(before)) {
		if (!(name in after)) {
			changes.push({ type: "table_dropped", table: name });
		}
	}

	// Columns in existing tables
	for (const tableName of Object.keys(before)) {
		if (!(tableName in after)) continue;

		const changes_ = diffColumns(tableName, before[tableName], after[tableName]);
		changes.push(...changes_);
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

	// Columns added
	for (const [colName, definition] of Object.entries(after.columns)) {
		if (!(colName in before.columns)) {
			changes.push({
				type: "column_added",
				table: tableName,
				column: colName,
				definition,
			});
		}
	}

	// Columns dropped
	for (const colName of Object.keys(before.columns)) {
		if (!(colName in after.columns)) {
			changes.push({
				type: "column_dropped",
				table: tableName,
				column: colName,
			});
		}
	}

	// Columns changed
	for (const colName of Object.keys(before.columns)) {
		if (!(colName in after.columns)) continue;

		const b = before.columns[colName];
		const a = after.columns[colName];
		if (!columnsEqual(b, a)) {
			changes.push({
				type: "column_changed",
				table: tableName,
				column: colName,
				before: b,
				after: a,
			});
		}
	}

	return changes;
}

/** Check if two column definitions are equal */
function columnsEqual(a: ColumnDefinition, b: ColumnDefinition): boolean {
	return (
		a.dataType === b.dataType &&
		a.nullable === b.nullable &&
		a.unique === b.unique &&
		a.default === b.default &&
		a.length === b.length &&
		arraysEqual(a.enumValues, b.enumValues) &&
		referencesEqual(a.references, b.references)
	);
}

function arraysEqual(a?: string[], b?: string[]): boolean {
	if (!a && !b) return true;
	if (!a || !b) return false;
	if (a.length !== b.length) return false;
	return a.every((v, i) => v === b[i]);
}

function referencesEqual(a?: [string, string], b?: [string, string]): boolean {
	if (!a && !b) return true;
	if (!a || !b) return false;
	return a[0] === b[0] && a[1] === b[1];
}

/** Check if there are any changes */
export function hasChanges(changes: SchemaChange[]): boolean {
	return changes.length > 0;
}
