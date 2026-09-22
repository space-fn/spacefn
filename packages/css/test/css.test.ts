import { describe, it, expect, beforeEach } from "vitest";

import { tokens, css, getCSS, drainStyles, transition, transitionAll } from "../src/index.js";

// ─── Tokens ───────────────────────────────────────────────────────────────────

describe("tokens", () => {
	it("generates var() references for leaf values", () => {
		const tkn = tokens({
			colors: { primary: { 500: "#3b82f6" } },
		});
		expect(tkn.colors.primary[500]).toBe("var(--colors-primary-500)");
	});

	it("generates var() for flat tokens", () => {
		const tkn = tokens({ spacing: { md: "1rem" } });
		expect(tkn.spacing.md).toBe("var(--spacing-md)");
	});

	it("supports deep nesting", () => {
		const tkn = tokens({
			a: { b: { c: { d: "value" } } },
		});
		expect(tkn.a.b.c.d).toBe("var(--a-b-c-d)");
	});

	it("supports numeric keys", () => {
		const tkn = tokens({
			gray: { 100: "#f5f5f5", 900: "#171717" },
		});
		expect(tkn.gray[100]).toBe("var(--gray-100)");
		expect(tkn.gray[900]).toBe("var(--gray-900)");
	});

	it("generates :root CSS", () => {
		const tkn = tokens({
			spacing: { md: "1rem" },
			colors: { primary: { 500: "#3b82f6" } },
		});

		const css = tkn.toCSS();
		expect(css).toContain(":root {");
		expect(css).toContain("--spacing-md: 1rem;");
		expect(css).toContain("--colors-primary-500: #3b82f6;");
		expect(css).toContain("}");
	});

	it("ref() returns var() by path", () => {
		const tkn = tokens({ spacing: { md: "1rem" } });
		expect(tkn.ref("spacing-md")).toBe("var(--spacing-md)");
	});
});

// ─── CSS Builder (no variants) ────────────────────────────────────────────────

describe("css without variants", () => {
	beforeEach(() => {
		drainStyles();
	});

	it("generates class names from id", () => {
		const cardSx = css("card", {
			base: { padding: "1rem" },
		});
		expect(cardSx.base).toBe("card_base");
	});

	it("generates multiple named classes", () => {
		const cardSx = css("card", {
			base: { padding: "1rem" },
			heading: { fontSize: "1.25rem" },
			footer: { borderTop: "1px solid #eee" },
		});
		expect(cardSx.base).toBe("card_base");
		expect(cardSx.heading).toBe("card_heading");
		expect(cardSx.footer).toBe("card_footer");
	});

	it("registers CSS in global store", () => {
		css("card", { base: { padding: "1rem" } });
		const styles = drainStyles();
		expect(styles.length).toBe(1);
		expect(styles[0]).toContain(".card_base {");
		expect(styles[0]).toContain("padding: 1rem;");
	});

	it("kebab-cases camelCase properties", () => {
		css("card", { base: { backgroundColor: "#fff", borderRadius: "8px" } });
		const styles = drainStyles();
		expect(styles[0]).toContain("background-color: #fff;");
		expect(styles[0]).toContain("border-radius: 8px;");
	});

	it("handles nested selectors", () => {
		css("card", {
			base: { "&:hover": { backgroundColor: "#f5f5f5" } },
		});
		const styles = drainStyles();
		expect(styles[0]).toContain("&:hover {");
		expect(styles[0]).toContain("background-color: #f5f5f5;");
	});

	it("handles media queries", () => {
		css("card", {
			base: { "@media (min-width: 768px)": { padding: "2rem" } },
		});
		const styles = drainStyles();
		expect(styles[0]).toContain("@media (min-width: 768px) {");
		expect(styles[0]).toContain("padding: 2rem;");
	});

	it("handles token var() references", () => {
		const tkn = tokens({ spacing: { md: "1rem" } });
		css("card", { base: { padding: tkn.spacing.md } });
		const styles = drainStyles();
		expect(styles[0]).toContain("padding: var(--spacing-md);");
	});
});

// ─── CSS Builder (with variants) ──────────────────────────────────────────────

describe("css with variants", () => {
	beforeEach(() => {
		drainStyles();
	});

	it("generates variant class names", () => {
		const btn = css("button", {
			base: { padding: "0.5rem" },
		})
			.variants({
				color: {
					primary: { backgroundColor: "#3b82f6" },
					danger: { backgroundColor: "#ef4444" },
				},
			})
			.defaults({ color: "primary" });

		expect(btn.base).toBe("button_base");
	});

	it("resolve returns base + variant classes", () => {
		const btn = css("button", {
			base: { padding: "0.5rem" },
		})
			.variants({
				color: {
					primary: { backgroundColor: "#3b82f6" },
					danger: { backgroundColor: "#ef4444" },
				},
			})
			.defaults({ color: "primary" });

		const resolved = btn({ color: "danger" });
		expect(resolved.base).toBe("button_base button_color_danger");
	});

	it("resolve with defaults when no overrides", () => {
		const btn = css("button", {
			base: { padding: "0.5rem" },
		})
			.variants({
				color: {
					primary: { backgroundColor: "#3b82f6" },
				},
			})
			.defaults({ color: "primary" });

		const resolved = btn();
		expect(resolved.base).toBe("button_base button_color_primary");
	});

	it("handles multiple variant groups", () => {
		const btn = css("button", {
			base: { padding: "0.5rem" },
		})
			.variants({
				color: {
					primary: { backgroundColor: "#3b82f6" },
					danger: { backgroundColor: "#ef4444" },
				},
				size: {
					sm: { padding: "0.25rem" },
					lg: { padding: "0.75rem" },
				},
			})
			.defaults({ color: "primary", size: "sm" });

		const resolved = btn({ color: "danger", size: "lg" });
		expect(resolved.base).toBe("button_base button_color_danger button_size_lg");
	});

	it("registers variant CSS rules", () => {
		css("button", { base: { padding: "0.5rem" } })
			.variants({
				color: {
					primary: { backgroundColor: "#3b82f6" },
				},
			})
			.defaults({ color: "primary" });

		const styles = drainStyles();
		const all = styles.join("\n");
		expect(all).toContain(".button_base {");
		expect(all).toContain(".button_color_primary {");
		expect(all).toContain("background-color: #3b82f6;");
	});
});

// ─── getCSS ───────────────────────────────────────────────────────────────────

describe("getCSS", () => {
	beforeEach(() => {
		drainStyles();
	});

	it("combines token CSS and style CSS", () => {
		const tkn = tokens({ spacing: { md: "1rem" } });
		css("card", { base: { padding: tkn.spacing.md } });

		const output = getCSS({ tokens: [tkn] });
		expect(output).toContain(":root {");
		expect(output).toContain("--spacing-md: 1rem;");
		expect(output).toContain(".card_base {");
		expect(output).toContain("padding: var(--spacing-md);");
	});

	it("returns empty string when nothing registered", () => {
		expect(getCSS({})).toBe("");
	});
});

// ─── Transitions ──────────────────────────────────────────────────────────────

describe("transition helpers", () => {
	it("transitionAll generates CSS", () => {
		expect(transitionAll()).toBe("all 200ms ease");
		expect(transitionAll("300ms")).toBe("all 300ms ease");
	});

	it("transition generates multi-property", () => {
		expect(transition("opacity, transform", "150ms")).toBe("opacity, transform 150ms ease 0s");
	});
});
