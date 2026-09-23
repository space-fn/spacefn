# @spacefn/css

Server-side CSS generation. Design tokens as TypeScript objects. Class-based styling with variants.

## Install

```bash
pnpm add @spacefn/css
```

## Quick Start

```ts
import { tokens, css, getCSS } from "@spacefn/css";

// Define tokens
const tkn = tokens({
	colors: {
		primary: { 500: "#3b82f6" },
	},
	spacing: {
		md: "1rem",
	},
});

// tkn.colors.primary[500] → "var(--colors-primary-500)"
// tkn.spacing.md → "var(--spacing-md)"

// Define styles
const cardSx = css("card", {
	base: { padding: tkn.spacing.md },
});
// cardSx.base → "card_base"

// Generate CSS
const css = getCSS({ tokens: [tkn] });
// Output: :root { --colors-primary-500: #3b82f6; --spacing-md: 1rem; }
```

## API

### `tokens(map)`

Create design tokens. Returns a proxy that generates CSS variable references.

```ts
const tkn = tokens({
	colors: { primary: { 500: "#3b82f6" } },
});

tkn.colors.primary[500]; // "var(--colors-primary-500)"
tkn.toCSS(); // ":root { --colors-primary-500: #3b82f6; }"
tkn.ref("colors.primary.500"); // "var(--colors-primary-500)" (manual path)
```

### `css(id, base)`

Create a style definition. Returns a class map.

```ts
const btnSx = css("btn", {
	base: { padding: "0.5rem", backgroundColor: "#3b82f6" },
});

btnSx.base; // "btn_base"
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
const output = getCSS({
	tokens: [tkn],
});
// :root { --colors-primary-500: #3b82f6; }
```

### `transition()`

Generate a custom CSS transition value.

```ts
import { transition } from "@spacefn/css";

transition("opacity", "150ms"); // "opacity 150ms ease"
```

### `transitionAll()`, `transitionColors()`, etc.

Pre-built transition helpers.

```ts
import {
	transitionAll,
	transitionColors,
	transitionTransform,
	transitionOpacity,
} from "@spacefn/css";

transitionAll("150ms"); // "all 150ms ease"
transitionColors("200ms"); // "color 200ms ease, background-color 200ms ease, border-color 200ms ease"
transitionTransform("150ms"); // "transform 150ms ease"
transitionOpacity("100ms"); // "opacity 100ms ease"
```

### Easing constants

```ts
import {
	easeLinear,
	easeIn,
	easeOut,
	easeInOut,
	easeStandard,
	easeDecelerate,
	easeAccelerate,
} from "@spacefn/css";

easeLinear; // "linear"
easeIn; // "cubic-bezier(0.4, 0, 1, 1)"
easeOut; // "cubic-bezier(0, 0, 0.2, 1)"
easeInOut; // "cubic-bezier(0.4, 0, 0.2, 1)"
easeStandard; // "cubic-bezier(0.4, 0, 0.2, 1)"
easeDecelerate; // "cubic-bezier(0, 0, 0.2, 1)"
easeAccelerate; // "cubic-bezier(0.4, 0, 1, 1)"
```

### `animation()`, `animationInfinite()`

Generate CSS animation values.

```ts
import { animation, animationInfinite } from "@spacefn/css";

animation("fade-in", "300ms"); // "fade-in 300ms ease"
animationInfinite("spin", "1s"); // "spin 1s ease infinite"
```

### `duration`

Predefined duration tokens.

```ts
import { duration } from "@spacefn/css";

duration.fast; // "150ms"
duration.normal; // "300ms"
duration.slow; // "500ms"
```

### `drainStyles()`

Reset the internal style registry. Useful for testing or server-side rendering where you need a clean state between requests.

```ts
import { drainStyles } from "@spacefn/css";

drainStyles(); // clears all registered styles
```

## Usage with @spacefn/html

```ts
import { h } from "@spacefn/html";
import { cardSx } from "./styles";

h.div({ class: cardSx.base }, "Card content");
h.div({ class: cardSx({ color: "danger" }).base }, "Danger card");
```
