// ─── Token System ─────────────────────────────────────────────────────────────
// Define design tokens as CSS custom properties with type-safe var() references.
// tokens({ colors: { primary: { 500: "#3b82f6" } } })
// → tkn.colors.primary[500]  →  "var(--colors-primary-500)"
// → tkn.toCSS()              →  ":root { --colors-primary-500: #3b82f6; }"

import type { TokenMap, TokenRefs } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLeaf(value: unknown): boolean {
	return typeof value === "string" || typeof value === "number";
}

// ─── Token Store ──────────────────────────────────────────────────────────────

class TokenStore {
	private vars = new Map<string, string>();

	/** Flatten nested token map into CSS variable entries */
	flatten(obj: TokenMap, prefix = ""): void {
		for (const [key, val] of Object.entries(obj)) {
			const path = prefix ? `${prefix}-${key}` : key;
			if (isLeaf(val)) {
				this.vars.set(path, String(val));
			} else {
				this.flatten(val as TokenMap, path);
			}
		}
	}

	/** Generate :root CSS with all token variables */
	toCSS(): string {
		const lines = [...this.vars.entries()].map(([k, v]) => `  --${k}: ${v};`).join("\n");
		return `:root {\n${lines}\n}`;
	}

	/** Get a CSS variable reference by path */
	ref(path: string): string {
		return `var(--${path})`;
	}
}

// ─── Proxy Builder ────────────────────────────────────────────────────────────

/**
 * Create a proxy that traverses the token map structure.
 * Leaf values → var() reference string.
 * Branch values → nested proxy for further access.
 */
function createProxy(
	store: TokenStore,
	node: TokenMap | string | number,
	prefix: string,
): Record<string, string> {
	return new Proxy(function () {}, {
		get(_target, prop, _receiver) {
			if (typeof prop === "symbol") return undefined;
			if (prop === "toCSS") return () => store.toCSS();
			if (prop === "ref") return (path: string) => store.ref(path);
			if (prop === "toString") return () => store.ref(prefix);
			if (prop === "valueOf") return () => store.ref(prefix);

			// Navigate into child
			if (typeof node === "object" && node !== null && prop in node) {
				const child = (node as TokenMap)[prop as string];
				const childPath = prefix ? `${prefix}-${prop}` : String(prop);
				if (isLeaf(child)) {
					// Leaf — return the var() string directly
					return store.ref(childPath);
				}
				// Branch — return nested proxy
				return createProxy(store, child as TokenMap, childPath);
			}

			// Fallback: assume it's a new level (for dynamic access)
			const childPath = prefix ? `${prefix}-${prop}` : String(prop);
			return store.ref(childPath);
		},
		apply(_target, _thisArg, args) {
			// Function call syntax: t.colors.gray(500) → var(--colors-gray-500)
			if (args.length === 1) {
				return store.ref(`${prefix}-${args[0]}`);
			}
			return store.ref(prefix);
		},
	}) as unknown as Record<string, string>;
}

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Define design tokens that compile to CSS custom properties.
 *
 * @example
 * ```ts
 * const tkn = tokens({
 *   colors: { primary: { 500: "#3b82f6" } },
 *   spacing: { md: "1rem" },
 * })
 *
 * tkn.colors.primary[500]  // "var(--colors-primary-500)"
 * tkn.spacing.md           // "var(--spacing-md)"
 * tkn.toCSS()              // ":root { --colors-primary-500: #3b82f6; --spacing-md: 1rem; }"
 * ```
 */
export function tokens<T extends TokenMap>(
	map: T,
): TokenRefs<T> & { toCSS(): string; ref(path: string): string } {
	const store = new TokenStore();
	store.flatten(map);
	return createProxy(store, map, "") as TokenRefs<T> & {
		toCSS(): string;
		ref(path: string): string;
	};
}
