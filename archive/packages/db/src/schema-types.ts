import { type ColumnDef, type IndexDef, type ColumnChain } from "./column.js";

/** Anything that can be a column: ColumnDef directly or a ColumnChain that has .build() */
export type ColumnInput = ColumnDef | ColumnChain;

export interface TableDef {
	[columnName: string]: ColumnInput | IndexDef[];
}

export interface SchemaDef {
	[tableName: string]: TableDef;
}

export function defineSchema<T extends SchemaDef>(schema: T): T {
	return schema;
}

function toColumnDef(value: ColumnInput): ColumnDef {
	if ("build" in value && typeof value.build === "function") {
		return value.build();
	}
	return value as ColumnDef;
}

export function getColumns(table: TableDef): Record<string, ColumnDef> {
	const columns: Record<string, ColumnDef> = {};
	for (const [key, value] of Object.entries(table)) {
		if (key === "_indexes") continue;
		if (Array.isArray(value)) continue;
		columns[key] = toColumnDef(value as ColumnInput);
	}
	return columns;
}

export function getIndexes(table: TableDef): IndexDef[] {
	const raw = (table as any)._indexes;
	if (!Array.isArray(raw)) return [];
	return raw as IndexDef[];
}

/** Convert snake_case or kebab-case to camelCase */
export function toCamelCase(str: string): string {
	return str
		.replace(/[-_]+(.)/g, (_, c) => c.toUpperCase())
		.replace(/^(.)/, (_, c) => c.toLowerCase());
}

/** Convert table name to PascalCase for type names */
export function toPascalCase(str: string): string {
	const camel = toCamelCase(str);
	return camel.charAt(0).toUpperCase() + camel.slice(1);
}
