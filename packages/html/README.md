# @spacefn/html

Typed functional server-side HTML renderer.

```ts
import { h, render } from "@spacefn/html";

const html = render(
	h.html(
		{},
		h.head({}, h.title({}, "Home")),
		h.body({}, h.h1({}, "Welcome"), h.p({}, "Rendered on the server.")),
	),
);
```

Text and attributes are escaped. Void elements are emitted without closing tags. Use `raw()` only for trusted markup. `defineComponent` and `renderComponent` provide typed props/slots composition; `HtmlElement`, `HtmlChild`, `AttrValue`, and per-tag attribute types are exported for library authors.

See the [HTML guide](../../docs/html.md).
