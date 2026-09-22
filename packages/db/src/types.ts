// --- Database Types -----------------------------------------------------------
// Core types for schema definition and Kysely compatibility

/** Column data types */
export type ColumnDataType =
	| "serial"
	| "integer"
	| "bigint"
	| "text"
	| "varchar"
	| "boolean"
	| "timestamp"
	| "date"
	| "time"
	| "decimal"
	| "real"
	| "double"
	| "json"
	| "jsonb"
	| "uuid"
	| "blob";

/** Column definition */
export interface ColumnDefinition {
	/** Column name */
	name: string;
	/** Column data type */
	dataType: ColumnDataType;
	/** Type arguments (e.g., varchar length, decimal precision) */
	typeArgs?: unknown[];
	/** Whether column is nullable */
	nullable: boolean;
	/** Whether column is a primary key */
	primaryKey: boolean;
	/** Whether column has unique constraint */
	unique: boolean;
	/** Default value expression */
	default?: string;
	/** Foreign key reference */
	references?: { table: string; column: string };
}

/** Table definition */
export interface TableDefinition {
	/** Table name */
	name: string;
	/** Column definitions */
	columns: Record<string, ColumnDefinition>;
}

/** Database schema (map of table definitions) */
export type DatabaseSchema = Record<string, TableDefinition>;

/** Infer TypeScript type from column definition */
export type InferColumnType<T extends ColumnDefinition> = T["dataType"] extends
	| "serial"
	| "integer"
	| "bigint"
	? number
	: T["dataType"] extends "boolean"
		? boolean
		: T["dataType"] extends "timestamp" | "date" | "time"
			? Date
			: T["dataType"] extends "json" | "jsonb"
				? unknown
				: T["dataType"] extends "blob"
					? Buffer
					: string;

/** Infer row type from table definition */
export type InferRowType<T extends TableDefinition> = {
	[K in keyof T["columns"]]: T["columns"][K]["primaryKey"] extends true
		? InferColumnType<T["columns"][K]> // serial is always Generated
		: T["columns"][K]["nullable"] extends true
			? InferColumnType<T["columns"][K]> | null
			: T["columns"][K]["default"] extends string
				? InferColumnType<T["columns"][K]> | undefined
				: InferColumnType<T["columns"][K]>;
};

/** Infer database type from schema */
export type InferDatabaseType<T extends DatabaseSchema> = {
	[K in keyof T]: InferRowType<T[K]>;
};
