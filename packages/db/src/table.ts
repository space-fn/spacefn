// --- Table Definition ---------------------------------------------------------
// defineTable() for schema definition

import type { ColumnBuilder } from "./column.js";
import type { TableDefinition } from "./types.js";

/** Define a table schema */
export function defineTable(name: string, columns: Record<string, ColumnBuilder>): TableDefinition {
	const columnDefs: TableDefinition["columns"] = {};

	for (const [key, builder] of Object.entries(columns)) {
		columnDefs[key] = builder.toJSON();
	}

	return { name, columns: columnDefs };
}
