---
title: assets/
icon: browser
---

# app/assets/

The browser's entries. Each script or stylesheet directly in the folder is an entry that Vite bundles, named after its file: `main.ts` is `main`, `site.css` is `site`. A page loads the entries it needs with `assets("name", ...)`.

```txt
app/assets/
├── site.css       @imports the base styles and each feature's
├── main.ts        what every page runs
└── charts.ts      only on the pages with a chart
```

`.ts`, `.tsx`, `.js` and `.css` files are entries; subfolders, `_` files and tests aren't. A framework component doesn't need one: an [island](../../6-guides/4-frontend.md#client-components) is an entry of its own. Two entries can't share a name (`main.ts` and `main.css`): import the stylesheet from the script instead.

Keep each entry to a few lines that import from `modules/` and `lib/`, so the code lives with its feature:

```ts [app/assets/charts.ts]
import { defineSalesChart } from "#modules/sales/client/sales-chart.ts";

defineSalesChart();
```

```css [app/assets/site.css]
@import "#lib/ui/base.css";
@import "#modules/todos/todos.css";
```

## Loading entries

```ts [lib/ui/layout.ts]
import { html, type HtmlValue } from "spacefn";
import { assets } from "spacefn/assets";

export const layout = (title: string, body: HtmlValue, head: HtmlValue = "") =>
	html`<!doctype html>
		<html lang="en">
			<head>
				<title>${title}</title>
				${assets("site")} ${head}
			</head>
			<body>
				${body}
			</body>
		</html>`;
```

`assets(...)` gives the `<script>` and `<link>` tags, in the order you name them, pointing at the sources in dev and at the hashed files in a build. The names are typed from this folder, so a misspelt or deleted entry is a type error.

Read more in [Frontend](../../6-guides/4-frontend.md).
