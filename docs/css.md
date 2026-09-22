# @spacefn/css

Server-side CSS generation. Design tokens as TypeScript objects. Class-based styling with variants.

## Core API

```ts
import { tokens, css, getCSS } from "@spacefn/css";
```

### `tokens(map)`

Create design tokens. Returns a proxy that generates CSS variable references.

```ts
const tkn = tokens({
	colors: {
		primary: { 500: "#3b82f6" },
	},
	spacing: {
		md: "1rem",
	},
});

tkn.colors.primary[500]; // "var(--colors-primary-500)"
tkn.spacing.md; // "var(--spacing-md)"
tkn.ref("colors.primary.500"); // "var(--colors-primary-500)" (manual path)
tkn.toCSS(); // ":root { --colors-primary-500: #3b82f6; --spacing-md: 1rem; }"
```

### `css(id, base)`

Create a style definition. Returns a class map.

```ts
const cardSx = css("card", {
	base: { padding: "1rem", backgroundColor: "#fff" },
});

cardSx.base; // "card_base"
```

### `.variants(config).defaults(config)`

Add variant classes. Variants override base styles.

```ts
const btnSx = css("button", {
	base: { padding: "0.5rem" },
})
	.variants({
		color: {
			primary: { backgroundColor: "#3b82f6" },
			danger: { backgroundColor: "#ef4444" },
		},
		size: {
			sm: { fontSize: "0.75rem" },
			lg: { fontSize: "1.25rem" },
		},
	})
	.defaults({ color: "primary", size: "sm" });

btnSx.base; // "button_base"
btnSx({ color: "danger" }).base; // "button_base button_color_danger"
btnSx({ size: "lg" }).base; // "button_base button_size_lg"
```

### `getCSS(input)`

Combine tokens and styles into a CSS string.

```ts
const output = getCSS({ tokens: [tkn] });
// ":root { --colors-primary-500: #3b82f6; --spacing-md: 1rem; }"
```

## Transition Helpers

```ts
import {
	transitionAll,
	transitionColors,
	transitionTransform,
	transitionOpacity,
	easeLinear,
	easeIn,
	easeOut,
	easeInOut,
	duration,
	animation,
} from "@spacefn/css";

transitionAll("150ms"); // "all 150ms ease"
transitionColors("200ms"); // "color 200ms ease, background-color 200ms ease, ..."
duration.normal; // "150ms"
easeInOut; // "cubic-bezier(0.4, 0, 0.2, 1)"
```

## Usage with @spacefn/html

```ts
import { h } from "@spacefn/html";
import { cardSx } from "./styles";

h.div({ class: cardSx.base }, "Card content");
h.div({ class: cardSx({ color: "danger" }).base }, "Danger card");
```

## Full Example

```ts
import { h } from "@spacefn/html";
import { tokens, css, getCSS } from "@spacefn/css";

// 1. Define tokens
const tkn = tokens({
	colors: {
		gray: { 50: "#f9fafb", 100: "#f3f4f6" },
		primary: { 500: "#3b82f6" },
	},
	spacing: { sm: "0.5rem", md: "1rem", lg: "1.5rem" },
});

// 2. Define styles
const cardSx = css("card", {
	base: { padding: tkn.spacing.md, backgroundColor: "#fff" },
})
	.variants({
		color: {
			default: { borderColor: tkn.colors.gray[100] },
			primary: { borderColor: tkn.colors.primary[500] },
		},
	})
	.defaults({ color: "default" });

// 3. Generate CSS
const cssOutput = getCSS({ tokens: [tkn] });

// 4. Use in HTML
const page = h.html(
	{},
	h.head({}, h.style({}, cssOutput)),
	h.body(
		{},
		h.div(
			{ class: cardSx({ color: "primary" }).base },
			h.h2({}, "Card Title"),
			h.p({}, "Card content"),
		),
	),
);
```
