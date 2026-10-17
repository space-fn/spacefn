// ─── CSS Types ────────────────────────────────────────────────────────────────

/** CSS property value */
export type CSSValue = string | number;

/** CSS properties object (recursive for nested selectors/media queries) */
export interface CSSProperties {
	[key: string]: CSSValue | CSSProperties;
}

// ─── Token Types ──────────────────────────────────────────────────────────────

/** Token map: nested object with string/number leaves */
export interface TokenMap {
	[key: string]: string | number | TokenMap;
}

/** Recursively map token leaves to var() reference strings */
export type TokenRefs<T> = {
	[K in keyof T]: T[K] extends string | number
		? string
		: T[K] extends TokenMap
			? TokenRefs<T[K]>
			: string;
};

// ─── Variant Types ────────────────────────────────────────────────────────────

/** Variant config: group name → variant name → styles */
export interface VariantConfig {
	[group: string]: Record<string, CSSProperties>;
}

/** Resolved variant values: group name → selected variant */
export type ResolvedVariants<V extends VariantConfig> = {
	[K in keyof V]: keyof V[K];
};

/** Default variant values */
export type VariantDefaults<V extends VariantConfig> = Partial<ResolvedVariants<V>>;

// ─── Compiled Style Types ─────────────────────────────────────────────────────

/** Simple compiled style: class name map */
export type CompiledStyle = Record<string, string>;

/** Variant resolve function signature */
export type VariantResolve<V extends VariantConfig> = (
	variants?: Partial<ResolvedVariants<V>>,
) => Record<string, string>;

/** Compiled variant style: class map + callable resolver */
export type CompiledVariantStyle<V extends VariantConfig = VariantConfig> = Record<string, string> &
	VariantResolve<V>;

// ─── Builder Types ────────────────────────────────────────────────────────────

/** Builder after .variants() — has .defaults() */
export interface VariantBuilder<V extends VariantConfig> {
	defaults<D extends VariantDefaults<V>>(config: D): CompiledVariantStyle<V>;
}

// ─── getCSS Types ─────────────────────────────────────────────────────────────

/** Input for getCSS */
export interface CSSInput {
	tokens?: Array<{ toCSS(): string }>;
}
