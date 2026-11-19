export type FieldKind = "string" | "number" | "boolean";

export interface Field<V = unknown> {
	readonly kind: FieldKind;
	readonly secret: boolean;
	readonly optional: boolean;
	readonly default: string | number | boolean | undefined;
	/** Type-only marker for the parsed value. */
	readonly _value?: V;
}

export interface FieldOptions<T> {
	default?: T;
	optional?: boolean;
}

type ValueOf<T, O extends FieldOptions<T>> = O extends { default: T }
	? T
	: O extends { optional: true }
		? T | undefined
		: T;

function field<V>(kind: FieldKind, secret: boolean, options: FieldOptions<unknown> = {}): Field<V> {
	return {
		kind,
		secret,
		optional: options.optional ?? false,
		default: options.default as Field["default"],
	};
}

/** A text value. Required unless it has a `default` or is `optional`. */
export function string<const O extends FieldOptions<string>>(
	options?: O,
): Field<ValueOf<string, O>> {
	return field("string", false, options);
}

/** A number, parsed from its text form. */
export function number<const O extends FieldOptions<number>>(
	options?: O,
): Field<ValueOf<number, O>> {
	return field("number", false, options);
}

/** A boolean, parsed from `true`, `false`, `1` or `0`. */
export function boolean<const O extends FieldOptions<boolean>>(
	options?: O,
): Field<ValueOf<boolean, O>> {
	return field("boolean", false, options);
}

/** A text value that never has a default and is declared as a secret binding. */
export function secret<const O extends { optional?: boolean }>(
	options?: O,
): Field<O extends { optional: true } ? string | undefined : string> {
	return field("string", true, options);
}

export type Schema = Record<string, Field>;

export type InferEnv<S extends Schema> = {
	readonly [K in keyof S]: S[K] extends Field<infer V> ? V : never;
};

/** Declares the environment an app reads. Default export of `env.ts`. */
export function defineEnv<const S extends Schema>(schema: S): S {
	return schema;
}
