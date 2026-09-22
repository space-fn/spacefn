// ─── Style Builder ────────────────────────────────────────────────────────────
// css("card", { base: { padding: "1rem" } })  →  class map
// css("btn", { base: {} }).variants({}).defaults({})  →  class map + callable

import type {
	CSSProperties,
	CSSInput,
	CompiledVariantStyle,
	VariantConfig,
	VariantDefaults,
	ResolvedVariants,
} from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kebabCase(str: string): string {
	return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}

/** Convert nested CSSProperties to a CSS declaration string */
function toCSS(properties: CSSProperties): string {
	const lines: string[] = [];
	for (const [prop, value] of Object.entries(properties)) {
		if (typeof value === "object" && value !== null) {
			const nested = toCSS(value);
			if (prop.startsWith("&") || prop.startsWith("@")) {
				lines.push(`${prop} {\n  ${nested}\n}`);
			} else {
				lines.push(`${kebabCase(prop)}: ${nested};`);
			}
		} else if (value !== undefined && value !== null) {
			lines.push(`${kebabCase(prop)}: ${value};`);
		}
	}
	return lines.join("\n  ");
}

// ─── Global Style Store ───────────────────────────────────────────────────────

const styleStore: string[] = [];

function registerStyle(css: string): void {
	styleStore.push(css);
}

/** Drain all registered styles (for getCSS) */
export function drainStyles(): string[] {
	return styleStore.splice(0, styleStore.length);
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function css<Id extends string>(
	id: Id,
	baseStyles: Record<string, CSSProperties>,
): {
	readonly [K in string]: string;
} & {
	variants<V extends VariantConfig>(
		config: V,
	): {
		defaults<D extends VariantDefaults<V>>(config: D): CompiledVariantStyle<V>;
	};
} {
	// Generate static class names: { base: "card_base", heading: "card_heading" }
	const staticClasses: Record<string, string> = {};
	for (const name of Object.keys(baseStyles)) {
		staticClasses[name] = `${id}_${name}`;
	}

	// Generate CSS for base styles
	const cssRules: string[] = [];
	for (const [name, styles] of Object.entries(baseStyles)) {
		const css = toCSS(styles);
		if (css) {
			cssRules.push(`.${staticClasses[name]} {\n  ${css}\n}`);
		}
	}

	// Register CSS
	if (cssRules.length > 0) {
		registerStyle(cssRules.join("\n\n"));
	}

	const base: Record<string, string> = staticClasses;

	return {
		...base,

		variants<V extends VariantConfig>(variantConfig: V) {
			return {
				defaults<D extends VariantDefaults<V>>(defaults: D): CompiledVariantStyle<V> {
					const resolvedDefaults = { ...defaults } as ResolvedVariants<V>;

					// Generate variant class names: { color: { primary: "btn_color_primary" } }
					const variantClasses: Record<string, Record<string, string>> = {};
					for (const [group, options] of Object.entries(variantConfig)) {
						variantClasses[group] = {};
						for (const variant of Object.keys(options)) {
							variantClasses[group][variant] = `${id}_${group}_${variant}`;
						}
					}

					// Generate variant CSS rules
					const variantRules: string[] = [];
					for (const [group, variants] of Object.entries(variantConfig)) {
						for (const [variant, styles] of Object.entries(variants)) {
							const css = toCSS(styles);
							if (css) {
								variantRules.push(`.${variantClasses[group][variant]} {\n  ${css}\n}`);
							}
						}
					}

					if (variantRules.length > 0) {
						registerStyle(variantRules.join("\n\n"));
					}

					// Create accessor function
					function resolve(overrides?: Partial<ResolvedVariants<V>>): Record<string, string> {
						const resolved = { ...resolvedDefaults, ...overrides } as ResolvedVariants<V>;
						const result: Record<string, string> = {};

						for (const name of Object.keys(baseStyles)) {
							const classes = [staticClasses[name]];
							for (const [group, value] of Object.entries(resolved)) {
								const cls = variantClasses[group]?.[value as string];
								if (cls) classes.push(cls);
							}
							result[name] = classes.join(" ");
						}

						return result;
					}

					// Merge base class names + resolve function
					const compiled = Object.assign(resolve, base) as CompiledVariantStyle<V>;
					return compiled;
				},
			};
		},
	} as {
		readonly [K in string]: string;
	} & {
		variants<V extends VariantConfig>(
			config: V,
		): {
			defaults<D extends VariantDefaults<V>>(config: D): CompiledVariantStyle<V>;
		};
	};
}

// ─── getCSS ───────────────────────────────────────────────────────────────────

export function getCSS(input: CSSInput): string {
	const parts: string[] = [];

	if (input.tokens) {
		for (const store of input.tokens) {
			const tokenCSS = store.toCSS();
			if (tokenCSS) parts.push(tokenCSS);
		}
	}

	// Collect all styles registered via css()
	parts.push(...drainStyles());

	return parts.join("\n\n");
}
