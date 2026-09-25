// --- Column Builder -----------------------------------------------------------
// Fluent API for defining table columns
// Name comes from the object key, not a string argument.

import type { ColumnDataType, ColumnDefinition } from "./types.js";

/** Column builder with fluent modifier chain */
export class ColumnBuilder {
	/** @internal */ _dataType: ColumnDataType;
	/** @internal */ _length?: number;
	/** @internal */ _nullable = false;
	/** @internal */ _unique = false;
	/** @internal */ _default?: string;
	/** @internal */ _references?: [table: string, column: string];
	/** @internal */ _enumValues?: string[];

	constructor(
		dataType: ColumnDataType,
		options?: {
			length?: number;
			nullable?: boolean;
			unique?: boolean;
			default?: string;
			references?: [table: string, column: string];
			enumValues?: string[];
		},
	) {
		this._dataType = dataType;
		if (options) {
			if (options.length !== undefined) this._length = options.length;
			if (options.nullable) this._nullable = options.nullable;
			if (options.unique) this._unique = options.unique;
			if (options.default !== undefined) this._default = options.default;
			if (options.references) this._references = options.references;
			if (options.enumValues) this._enumValues = options.enumValues;
		}
	}

	/** Allow NULL values (default is NOT NULL) */
	nullable(): this {
		this._nullable = true;
		return this;
	}

	/** Add UNIQUE constraint */
	unique(): this {
		this._unique = true;
		return this;
	}

	/** Set default value. String values are treated as SQL expressions. */
	default(value: string): this {
		this._default = value;
		return this;
	}

	/** Add foreign key reference */
	references(table: string, column: string): this {
		this._references = [table, column];
		return this;
	}

	/** Serialize to a plain object (for snapshots) */
	toJSON(): ColumnDefinition {
		const def: ColumnDefinition = {
			dataType: this._dataType,
			nullable: this._nullable,
			unique: this._unique,
		};
		if (this._length !== undefined) def.length = this._length;
		if (this._default !== undefined) def.default = this._default;
		if (this._references) def.references = this._references;
		if (this._enumValues) def.enumValues = this._enumValues;
		return def;
	}
}

// --- Column Type Creators ----------------------------------------------------

/** Auto-incrementing integer, primary key convention */
export function id(): ColumnBuilder {
	return new ColumnBuilder("serial", { default: "auto" });
}

/** VARCHAR(255) by default, or VARCHAR(n) with length */
export function string(length?: number): ColumnBuilder {
	return new ColumnBuilder("varchar", { length });
}

/** Unlimited text */
export function text(): ColumnBuilder {
	return new ColumnBuilder("text");
}

/** Integer */
export function integer(): ColumnBuilder {
	return new ColumnBuilder("integer");
}

/** Boolean */
export function boolean(): ColumnBuilder {
	return new ColumnBuilder("boolean");
}

/** Timestamp without timezone */
export function timestamp(): ColumnBuilder {
	return new ColumnBuilder("timestamp");
}

/** JSON (JSONB on PostgreSQL) */
export function json(): ColumnBuilder {
	return new ColumnBuilder("json");
}

/** Enum — varchar with CHECK constraint */
export function enumColumn(...values: string[]): ColumnBuilder {
	return new ColumnBuilder("enum", { enumValues: values });
}

/**
 * Timestamps helper. Returns `{ create, update }` for use as column values.
 *
 * @example
 * ```ts
 * export const users = defineTable("users", {
 *   createdAt: column.timestamps().create,
 *   updatedAt: column.timestamps().update,
 * })
 * ```
 */
export function timestamps(): { create: ColumnBuilder; update: ColumnBuilder } {
	return {
		create: new ColumnBuilder("timestamp", { default: "auto" }),
		update: new ColumnBuilder("timestamp", { default: "auto" }),
	};
}

/** Column namespace — use as `column.string()`, `column.id()`, etc. */
export const column = {
	id,
	string,
	text,
	integer,
	boolean,
	timestamp,
	json,
	enum: enumColumn,
	timestamps,
};
