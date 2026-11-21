---
title: client/
icon: browser
---

# app/client/

The browser's entries. Each script or stylesheet directly in the folder is an entry that Vite bundles, named after its file: `main.ts` is `main`, `site.css` is `site`. A page loads the entries it needs with `assets("name", ...)`.

```txt
app/client/
├── site.css       @imports the base styles and each feature's
├── main.ts        what every page runs
└── cart.tsx       only on the pages with a cart
```

`.ts`, `.tsx`, `.js` and `.css` files are entries; subfolders, `_` files and tests aren't. Two entries can't share a name (`main.ts` and `main.css`): import the stylesheet from the script instead.

Keep each entry to a few lines that import from `modules/` and `lib/`, so the code lives with its feature:

```ts [app/client/cart.tsx]
import { mountCart } from "#modules/cart/client/mount.tsx";

mountCart();
```

```css [app/client/site.css]
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
