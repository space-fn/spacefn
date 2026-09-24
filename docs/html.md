# @spacefn/html

Functional, escaped, server-side HTML rendering with typed attributes and component helpers.

## Install

```bash
pnpm add @spacefn/html
```

## Elements

Every tag accepts an attribute object (or `null`) followed by children. Children may be strings, numbers, booleans, `null`, `undefined`, or HTML elements. `null`, `undefined`, and booleans render nothing.

```ts
import { h, render } from "@spacefn/html";

const element = h.div(
	{ class: "card", id: "welcome" },
	h.h1({}, "Welcome"),
	h.p({}, "Rendered on the server."),
);

const html = render(element);
```

Text and attribute values are escaped. Void elements (`img`, `input`, `meta`, `link`, `br`, and others) never receive a closing tag.

```ts
h.img({ src: "/logo.svg", alt: "SpaceFn" });
// <img src="/logo.svg" alt="SpaceFn">
```

`render` is the short name for `renderElement`.

`defineComponent` creates a function from props and optional slots. `renderComponent` renders the resulting element:

```ts
import { defineComponent, h, renderComponent, type HtmlElement } from "@spacefn/html";

type CardProps = { title: string };
type CardSlots = { default: HtmlElement; footer: HtmlElement };

const Card = defineComponent<CardProps, CardSlots>((props, slots) =>
	h.article({ class: "card" }, h.h2({}, props.title), slots.default, slots.footer),
);

const html = renderComponent(
	Card({ title: "Post Card" }, { default: h.p({}, "Content"), footer: h.small({}, "Footer") }),
);
```

A component can also be a plain function when slots are unnecessary:

```ts
const Heading = (title: string) => h.h1({}, title);
```

## Raw HTML

`raw` bypasses escaping. Only use it for trusted, already-sanitized markup:

```ts
import { h, raw, render } from "@spacefn/html";
render(h.div({}, raw("<strong>trusted</strong>")));
```

## Attributes

Known tags use per-element TypeScript attribute types. Global attributes (`class`, `id`, `style`, `hidden`, ARIA/data attributes, and event names) are available across tags. `img` and `a` include accessibility-oriented required attributes in their typed helpers.

```ts
import { anchorHref, h, imgAlt } from "@spacefn/html";

h.a(anchorHref("/docs"), "Docs");
h.img({ src: "/decorative.svg", ...imgAlt("") });
```

Attributes with `false`, `null`, or `undefined` are omitted. `true` renders a boolean attribute without a value.
