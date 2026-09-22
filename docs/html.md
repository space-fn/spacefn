# @space/html

Functional style server side html renderer.

Example:

```ts
import { renderComponent, defineComponent, h, type HtmlElement } from "@space/html";

type CardProps = {
	title: string;
};
type CardSlots = {
	default: HtmlElement;
	footer: HtmlElement;
};
const card = defineComponent<CardProps, CardSlots>((props, slots) => {
	return h.div(
		{},
		h.div({}, h.h1({}, props.title)),
		h.div({}, slots.default),
		h.div({}, slots.footer),
	);
});

const page = defineComponent<InitialData>((data) => {
	return h.html(
		{},
		h.head(),
		h.body(
			{},
			h.main(
				{},
				h.h1({}, "Welcome"),
				card(data.cardTitle, {
					default: h.p({}, "Card content is here"),
					footer: h.div({}, h.button({}, "Like")),
				}),
			),
		),
	);
});

const initialData = { cardTitle: "Post Card" };
// render to html string
const html = renderComponent(page(initialData));
```
