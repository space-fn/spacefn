---
icon: palette
---

# Frontend

Pages are server-rendered `html` (see [Pages](3-pages.md)). What runs in the browser is bundled by Vite from `app/assets/`, and each page loads only what it uses. Every section below has a tested app in `examples/`, which also ships in `node_modules/spacefn-docs/examples/`.

## Where browser code goes

The same split as the rest of the app (see [Conventions](../2-conventions.md#where-code-goes)):

```txt
my-app/
├── app/
│   └── assets/
│       ├── main.ts          an entry: imports from modules/ and lib/, and starts them
│       └── site.css         an entry: @imports the stylesheets
├── modules/
│   └── <feature>/
│       ├── client/          the feature's components and scripts
│       └── <feature>.css    the feature's styles
├── lib/
│   └── ui/                  the UI kit: layout, components, design tokens
└── public/                  files served as they are at /
```

An entry is each file directly in `app/assets/`, named after the file: `app/assets/main.ts` is `main`. Keep entries to a few lines, so the code itself lives with its feature:

```ts [app/assets/cart.ts]
import { mountCart } from "#modules/cart/client/mount.ts";

mountCart();
```

```css [app/assets/site.css]
@import "#lib/ui/base.css";
@import "#modules/todos/todos.css";
```

`#lib/...` and `#modules/...` imports work in CSS too.

## Loading entries

`assets(...)` from `spacefn/assets` gives the `<script>` and `<link>` tags of the entries you name, in that order. The layout loads what every page needs; a page that needs more passes its own, so a heavy script is only downloaded where it's used:

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

```ts [app/routes/index.ts]
render: (ctx) => layout("Shop", shopPage(ctx.data), assets("cart")),
```

In dev the tags point at the sources, after Vite's client and what plugins add to a page's head (React's refresh preamble, for one). In a build they point at the hashed files, with their CSS and preloads. A tag two entries share comes once. The names are typed: `assets("mian")` is a type error, and so is loading an entry that was deleted.

## Public files

Files in `public/`, at the app root, are served as they are at `/`: `public/favicon.svg` is `/favicon.svg`. They are copied into the build and, on both targets, answered before the app runs, so a public file at a route's URL is an error from `space gen`. Put files there that need a fixed URL (icons, `robots.txt`, images linked from elsewhere); import the rest from `app/assets/`, so they get hashed names.

## CSS

Plain CSS works as it is: Vite bundles each stylesheet entry and its `@import`s.

**Lightning CSS.** Set it as Vite's CSS transformer in `configs/vite.ts` to write nesting, custom media and `light-dark()`, lowered for the browsers you target. See `examples/lightningcss`.

```ts [configs/vite.ts]
export default defineConfig({
	css: {
		transformer: "lightningcss",
		lightningcss: {
			targets: { chrome: 109 << 16, firefox: 115 << 16, safari: 15 << 16 },
			drafts: { customMedia: true },
		},
	},
	build: { cssMinify: "lightningcss" },
	plugins: [space({ target: "bun" })],
});
```

**Tailwind.** Add its Vite plugin beside spacefn's, and import it from the stylesheet that holds your theme. Tailwind finds the classes in every file that isn't gitignored, so `app/`, `modules/` and `lib/` all count. Write class names out in full in components, so it sees them. See `examples/tailwind`.

```ts [configs/vite.ts]
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({ plugins: [tailwindcss(), space({ target: "bun" })] });
```

```css [lib/ui/theme.css]
@import "tailwindcss";

@theme {
	--color-brand-600: oklch(52% 0.2 265);
}
```

## Client components

A component from React, Vue, Solid or Svelte runs as an island: the server renders an element and the component's props as JSON, and an asset entry starts the component in it. The component isn't rendered on the server; the island starts empty and fills in once its script runs.

1. Add the framework's Vite plugin beside spacefn's in `configs/vite.ts`.
2. Render the island from the page's view, with a small helper in `lib/ui/`:

```ts [lib/ui/island.ts]
import { html, raw } from "spacefn";

// The props go in a JSON script, not a data- attribute, which Datastar would read as its own.
// `<` is escaped so no string in the props can close the script.
export const island = (id: string, props: unknown) =>
	html`<div id="${id}"></div>
		<script type="application/json" id="${id}-props">
			${raw(JSON.stringify(props).replaceAll("<", "\\u003c"))}
		</script>`;
```

```ts [lib/ui/mount.ts]
export const mountIsland = <P>(id: string, start: (element: HTMLElement, props: P) => void) => {
	const element = document.getElementById(id);
	const props = document.getElementById(`${id}-props`)?.textContent ?? "{}";
	if (element) start(element, JSON.parse(props) as P);
};
```

3. Mount it from the feature's client code, and call that from an entry the page loads with `assets(...)`:

```tsx [modules/cart/client/mount.tsx]
import { createRoot } from "react-dom/client";

import { mountIsland } from "#lib/ui/mount.ts";

import type { Product } from "../cart.ts";
import { Cart } from "./Cart.tsx";

export const mountCart = () =>
	mountIsland<{ products: readonly Product[] }>("cart", (element, props) =>
		createRoot(element).render(<Cart products={props.products} />),
	);
```

| Framework | Plugin                                                              | Mount                                   | Example           |
| --------- | ------------------------------------------------------------------- | --------------------------------------- | ----------------- |
| React     | `react()` from `@vitejs/plugin-react`                               | `createRoot(element).render(<Cart />)`  | `examples/react`  |
| Solid     | `solid()` from `vite-plugin-solid`                                  | `render(() => <Cart />, element)`       | `examples/solid`  |
| Vue       | `vue()` from `@vitejs/plugin-vue`                                   | `createApp(Cart, props).mount(element)` | `examples/vue`    |
| Svelte    | `svelte({ configFile: false })` from `@sveltejs/vite-plugin-svelte` | `mount(Cart, { target, props })`        | `examples/svelte` |

Put what the server and the component share, such as types and formatting, in a file that imports nothing server-only (`modules/cart/cart.ts`). For `.tsx`, set `jsx` in `configs/tsconfig.json` (`react-jsx`, or `preserve` with `jsxImportSource: "solid-js"`). `tsc` doesn't read `.vue` or `.svelte` files: the examples declare them in `lib/types/`, and `vue-tsc` or `svelte-check` checks their insides. With Solid, set Vitest's `environment: "node"` in `configs/vitest.ts`, since its plugin switches it to jsdom.

## Datastar

[Datastar](https://data-star.dev) adds behavior to server-rendered HTML with `data-*` attributes, and the server answers its requests by patching elements and signals (see [Pages](3-pages.md#live-updates-with-datastar)). These conventions keep the markup and the server in step; `examples/datastar` uses all of them.

**Components are functions from props to `html`**, in `modules/<feature>/views.ts`, or `lib/ui/` when every feature uses them. They take what they show and the URLs they call as props, not the page's `ctx`, so a live update can render them too:

```ts [modules/poll/views.ts]
export const results = (props: { readonly results: readonly Result[] }) =>
	html`<ol id="${results.id}">
		${props.results.map((result) => html`<li>${result.label}: ${result.percent}%</li>`)}
	</ol>`;
results.id = "poll-results";
```

**An element Datastar patches has a fixed `id`, exported beside its component**, as `results.id` above. Datastar morphs elements in by id, so the page's first render and every update use the same one.

**Signals live under the feature's name.** Declare them once, on the feature's root element, and read them as `$poll.choice`. Two features on one page then can't overwrite each other's:

```ts
html`<main data-signals="{poll: {choice: '', voted: ''}}">...</main>`;
```

**Actions are the page's actions.** `@get` and `@post` send every signal: a `get` action receives them as its input, and so does a `post` one, from the JSON body. Decode them with a Schema shaped like the signals, and answer with what to patch:

```ts
vote: action({
	input: Schema.Struct({ poll: Schema.Struct({ choice: Schema.Literals(["tabs", "spaces"]) }) }),
	handler: ({ poll }) =>
		Effect.andThen(
			Poll.vote(poll.choice),
			Datastar.sse([Datastar.patchSignals({ poll: { voted: poll.choice } })]),
		),
}),
```

```ts
html`<button data-on:click="$poll.choice = 'tabs'; @post('${props.vote}')">Tabs</button>`;
```

Outside `render`, where there's no `ctx`, `actionUrl("vote")` gives the same URL as `ctx.actions.vote.url`.

**Web components with Rocket.** For a reusable element with its own state and styles, Datastar's [Rocket](https://data-star.dev/reference/rocket) defines custom elements whose templates use Datastar attributes. Put each in `modules/<feature>/client/<name>.ts`, name it after the feature (`poll-meter`), and register it from an entry. Rocket is in beta and comes in the `datastar-rocket.js` bundle, which includes Datastar, so load it in place of `datastar.js`; check its license before you ship it.

```ts [modules/poll/client/poll-meter.ts]
import { rocket } from "https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.5/bundles/datastar-rocket.js";

export const definePollMeter = () =>
	rocket("poll-meter", {
		props: ({ number, string }) => ({
			label: string.trim.default(""),
			value: number.clamp(0, 100).default(0),
		}),
		render: ({ html, props: { label, value } }) =>
			html`<span>${label}</span> <span>${value}%</span>`,
	});
```

The server renders `<poll-meter label="Tabs" value="40">`, and when a live update morphs new attributes in, the element renders again.
