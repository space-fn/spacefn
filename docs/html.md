# @spacefn/html

Server-side HTML generation. Build HTML elements as TypeScript functions. Type-safe attributes with a11y enforcement.

## Core API

```ts
import { h, renderElement, raw, defineComponent, renderComponent } from "@spacefn/html";
```

### `h.<tag>(attrs, ...children)`

Create an HTML element. Attributes are typed per element.

```ts
h.div({ class: "container" }, "Hello");
h.a({ href: "/about" }, "About");
h.img({ src: "/logo.png", alt: "Logo" }); // a11y: alt required
h.button(null, "Click");
```

### `renderElement(element)`

Render an `HtmlElement` to an HTML string.

```ts
const html = renderElement(h.h1({}, "Hello"));
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
type CardProps = { title: string };

const card = defineComponent<CardProps>((props) => {
	return h.div({ class: "card" }, h.h2({}, props.title), h.p({}, "Content"));
});

// Usage
card({ title: "My Card" });
```

### Slots

Slots are named children passed as the second argument. The component receives them as `HtmlElement` values.

```ts
type CardProps = { title: string };
type CardSlots = { default: HtmlElement; footer: HtmlElement };

const card = defineComponent<CardProps, CardSlots>((props, slots) => {
	return h.div(
		{ class: "card" },
		h.div({ class: "header" }, h.h2({}, props.title)),
		h.div({ class: "body" }, slots.default),
		h.div({ class: "footer" }, slots.footer),
	);
});

// Usage
card(
	{ title: "Post Card" },
	{
		default: h.p({}, "Card content is here"),
		footer: h.div({}, h.button({}, "Like")),
	},
);
```

Slots are optional. If a slot is not provided, it defaults to an empty object.

### `renderComponent(element)`

Render a component's output to an HTML string. Convenience wrapper for `renderElement()`.

```ts
const html = renderComponent(card({ title: "My Card" }));
```

## Types

```ts
type HtmlChild = string | number | boolean | null | undefined | HtmlElement;

interface HtmlElement {
	tag: string;
	attrs: Record<string, AttrValue>;
	children: HtmlChild[];
}

type AttrValue = string | number | boolean | null | undefined;
```

## Full Example

```ts
import { h, renderElement, defineComponent, renderComponent } from "@spacefn/html";

type PageProps = { title: string; content: string };
type PageSlots = { sidebar: HtmlElement };

const page = defineComponent<PageProps, PageSlots>((props, slots) => {
	return h.html(
		{},
		h.head({}, h.title({}, props.title)),
		h.body(
			{},
			h.main({}, h.h1({}, props.title), h.p({}, props.content)),
			h.aside({}, slots.sidebar),
		),
	);
});

const html = renderComponent(
	page({ title: "Hello", content: "World" }, { sidebar: h.nav({}, h.a({ href: "/" }, "Home")) }),
);
```
