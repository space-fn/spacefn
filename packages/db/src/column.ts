// --- Column Builder -----------------------------------------------------------
// Fluent API for defining table columns

import type { ColumnDefinition, ColumnDataType } from "./types.js";

/** Create a column definition */
function createColumn(name: string, dataType: ColumnDataType, typeArgs?: unknown[]): ColumnBuilder {
	return new ColumnBuilder(name, dataType, typeArgs);
}

/** Column builder with fluent API */
export class ColumnBuilder {
	/** @internal */ _name: string;
	/** @internal */ _dataType: ColumnDataType;
	/** @internal */ _typeArgs?: unknown[];
	/** @internal */ _nullable = false;
	/** @internal */ _primaryKey = false;
	/** @internal */ _unique = false;
	/** @internal */ _default?: string;
	/** @internal */ _references?: { table: string; column: string };

	constructor(name: string, dataType: ColumnDataType, typeArgs?: unknown[]) {
		this._name = name;
		this._dataType = dataType;
		this._typeArgs = typeArgs;
	}

	/** Mark column as NOT NULL */
	notNull(): this {
		this._nullable = false;
		return this;
	}

	/** Mark column as nullable */
	nullable(): this {
		this._nullable = true;
		return this;
	}

	/** Mark column as primary key */
	primaryKey(): this {
		this._primaryKey = true;
		return this;
	}

	/** Add unique constraint */
	unique(): this {
		this._unique = true;
		return this;
	}

	/** Set default value (SQL expression) */
	default(value: string): this {
		this._default = value;
		return this;
	}

	/** Add foreign key reference */
	references(table: string, column: string): this {
		this._references = { table, column };
		return this;
	}

	/** Build the column definition */
	toJSON(): ColumnDefinition {
		return {
			name: this._name,
			dataType: this._dataType,
			typeArgs: this._typeArgs,
			nullable: this._nullable,
			primaryKey: this._primaryKey,
			unique: this._unique,
			default: this._default,
			references: this._references,
		};
	}
}

// --- Column Type Creators ----------------------------------------------------

/** Serial (auto-incrementing integer, primary key) */
export function serial(name: string): ColumnBuilder {
	return createColumn(name, "serial");
}

/** Integer */
export function integer(name: string): ColumnBuilder {
	return createColumn(name, "integer");
}

/** BigInt */
export function bigint(name: string): ColumnBuilder {
	return createColumn(name, "bigint");
}

/** Text */
export function text(name: string): ColumnBuilder {
	return createColumn(name, "text");
}

/** VARCHAR with length */
export function varchar(name: string, length: number): ColumnBuilder {
	return createColumn(name, "varchar", [length]);
}

/** Boolean */
export function boolean(name: string): ColumnBuilder {
	return createColumn(name, "boolean");
}

/** Timestamp */
export function timestamp(name: string): ColumnBuilder {
	return createColumn(name, "timestamp");
}

/** Date */
export function date(name: string): ColumnBuilder {
	return createColumn(name, "date");
}

/** Time */
export function time(name: string): ColumnBuilder {
	return createColumn(name, "time");
}

/** Decimal with precision and scale */
export function decimal(name: string, precision: number, scale: number): ColumnBuilder {
	return createColumn(name, "decimal", [precision, scale]);
}

/** Real (single precision) */
export function real(name: string): ColumnBuilder {
	return createColumn(name, "real");
}

/** Double precision */
export function double(name: string): ColumnBuilder {
	return createColumn(name, "double");
}

/** JSON */
export function json(name: string): ColumnBuilder {
	return createColumn(name, "json");
}

/** JSONB (binary JSON, PostgreSQL) */
export function jsonb(name: string): ColumnBuilder {
	return createColumn(name, "jsonb");
}

/** UUID */
export function uuid(name: string): ColumnBuilder {
	return createColumn(name, "uuid");
}

/** Blob (binary data) */
export function blob(name: string): ColumnBuilder {
	return createColumn(name, "blob");
}

/** Column namespace for `column.xxx()` syntax */
export const column = {
	serial,
	integer,
	bigint,
	text,
	varchar,
	boolean,
	timestamp,
	date,
	time,
	decimal,
	real,
	double,
	json,
	jsonb,
	uuid,
	blob,
};
