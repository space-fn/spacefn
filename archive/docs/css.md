# @spacefn/css

Functional server-rendered CSS with deterministic class names, nested selectors, design tokens, variants, and transition helpers.

## Install

```bash
pnpm add @spacefn/css
```

## Tokens

```ts
import { sx } from "@spacefn/css";

export const tokens = sx.tokens((t) => ({
	colors: {
		gray: { 50: "#f8fafc", 900: "#0f172a" },
		primary: t.colors.blue[600],
	},
	spacing: { sm: "0.5rem", md: "1rem" },
}));
```

Token leaves become `var(--token-path)` references in generated CSS. `sx.hex()` and `sx.rgba()` create token placeholders for later values.

## Styles

```ts
import { sx } from "@spacefn/css";

export const card = sx.css.id("card").style(() => ({
	base: {
		background: "white",
		padding: "var(--spacing-md)",
		":hover": { boxShadow: "0 2px 8px #0002" },
	},
}));
```

The `base` key is emitted as the class returned by `card.base`. Other keys become additional generated classes. Nested selectors use `&` to reference the generated class.

## Variants and CSS output

```ts
import { getCSS } from "@spacefn/css";

export const button = sx.css
	.id("button")
	.variants({ size: { sm: {}, lg: {} }, tone: { primary: {}, danger: {} } })
	.defaults({ size: "sm", tone: "primary" })
	.style((variant) => ({
		base: { borderRadius: "0.375rem" },
		label: { fontWeight: variant.tone === "danger" ? "700" : "500" },
	}));

export const stylesheet = getCSS({
	tokens,
	styles: [button],
});
```

Use `button.base` for the default class and the style object's variant helpers for explicit combinations. `getCSS` returns the complete stylesheet and resets the global style registry after draining it.

## HTML integration

```ts
import { h } from "@spacefn/html";
import { button, stylesheet } from "./styles";

h.html(
	{},
	h.head({}, h.style({}, stylesheet)),
	h.body({}, h.button({ class: button.base }, "Save")),
);
```

## Transitions

`transition` and `transitionAll` generate transition declarations from explicit property/duration/easing options. `drainStyles()` is available when an application needs to consume the registered style rules incrementally.
