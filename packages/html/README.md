# @spacefn/html

Server-side HTML generation. Build HTML elements as TypeScript functions. Type-safe attributes with a11y enforcement.

## Install

```bash
pnpm add @spacefn/html
```

## Quick Start

```ts
import { h, render } from "@spacefn/html";

const page = h.div({ class: "container" }, h.h1({}, "Hello"), h.p({}, "World"));

console.log(render(page));
// <div class="container"><h1>Hello</h1><p>World</p></div>
```

## API

### `h.<tag>(attrs, ...children)`

Create an HTML element. Attributes are typed per element. Pass `null` for no attributes.

```ts
h.div({ class: "box" }, "text");
h.a({ href: "/about" }, "About");
h.img({ src: "/logo.png", alt: "Logo" }); // a11y: alt required
h.button(null, "Click");
```

### `render(element)`

Render an `HtmlElement` to an HTML string.

```ts
const html = render(h.h1({}, "Hello"));
// "<h1>Hello</h1>"
```

### `raw(htmlString)`

Insert raw HTML. Bypasses escaping. Use only for trusted content.

```ts
h.div(null, raw("<strong>Safe</strong>"));
```

### `defineComponent(fn)`

Define a reusable component with typed props and optional slots. Returns a function that produces `HtmlElement`.

```ts
import { defineComponent, h } from "@spacefn/html";

type CardProps = { title: string };

const card = defineComponent<CardProps>((props) => {
	return h.div({ class: "card" }, h.h2({}, props.title));
});

// Usage
card({ title: "My Card" });
```

### Slots

Slots are named children passed as the second argument.

```ts
type CardProps = { title: string };
type CardSlots = { default: HtmlElement; footer: HtmlElement };

const card = defineComponent<CardProps, CardSlots>((props, slots) => {
	return h.div(
		{ class: "card" },
		h.div({ class: "body" }, slots.default),
		h.div({ class: "footer" }, slots.footer),
	);
});

// Usage
card(
	{ title: "Post Card" },
	{
		default: h.p({}, "Card content"),
		footer: h.button({}, "Like"),
	},
);
```

Slots are optional. Unprovided slots default to empty.

### `renderComponent(element)`

Render a component's output to an HTML string. Convenience wrapper for `render()`.

```ts
const html = renderComponent(card({ title: "My Card" }));
```

## Attributes

Each HTML element has typed attributes. TypeScript enforces required attributes (like `alt` on `<img>`) at compile time.

```ts
// Type error: alt is required
h.img({ src: "/logo.png" });

// OK
h.img({ src: "/logo.png", alt: "Logo" });
```

## Children

Children can be strings, numbers, booleans, null, undefined, or other elements.

```ts
h.div(
	{ class: "wrapper" },
	"Text content",
	42,
	true, // renders nothing
	null, // renders nothing
	h.span({}, "nested"),
);
```

## Void Elements

Self-closing tags (`<br>`, `<img>`, `<input>`, etc.) render without closing tags.

```ts
render(h.br()); // "<br>"
render(h.input({ type: "text" })); // "<input type="text">"
```
