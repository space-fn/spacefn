# Datastar components with Rocket

For highly interactive, complex, reusable UI components, Rocket is the
recommended component path for spacefn. Rocket is Datastar's official
web-component API: components are custom elements, and Datastar provides the
reactivity and DOM updates inside them.

Rocket is currently in beta. Pin the JavaScript bundle and its declaration file
to the same Datastar release, and check the [official Rocket reference](https://data-star.dev/reference/rocket)
when upgrading.

## Add the Rocket bundle and types

Rocket is distributed as a browser bundle rather than a separate runtime
package. The `datastar-rocket.js` bundle includes Datastar, so use it instead
of loading `datastar.js` on a page that uses Rocket.

Download the JavaScript bundle and its matching declarations into a nested
folder under `app/client/`:

```sh
mkdir -p app/client/vendor
curl -fsSLo app/client/vendor/datastar-rocket.js \
	https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.4/bundles/datastar-rocket.js
curl -fsSLo app/client/vendor/datastar-rocket.d.ts \
	https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.4/bundles/datastar-rocket.d.ts
```

The `.d.ts` file gives TypeScript types and editor completion for `rocket`,
component props, render context, and lifecycle hooks. `app/client/tsconfig.json`
includes the directory, and the Vite client build follows the imports from your
entry point.

## Define a reusable component

Put each component in a module under `app/client/`. For example,
`app/client/components/counter.ts`:

```ts
import { rocket } from "../vendor/datastar-rocket.js";

rocket("demo-counter", {
	mode: "light",
	props: ({ number, string }) => ({
		count: number.step(1).min(0),
		label: string.trim.default("Counter"),
	}),
	setup: ({ $$, observeProps, props }) => {
		$$.count = props.count;
		observeProps(() => {
			$$.count = props.count;
		}, "count");
	},
	render: ({ html, props: { count, label } }) => html`
		<div>
			<button
				type="button"
				data-on:click="$$count += 1"
				data-text="${label} + ': ' + $$count"
			></button>
			<template data-if="$$count !== ${count}">
				<button type="button" data-on:click="$$count = ${count}">Reset</button>
			</template>
		</div>
	`,
});
```

The declared props form the component's public API. Rocket's codecs normalize
the HTML attributes, `setup` creates per-instance reactive state, and
`render` returns the component DOM. Each `<demo-counter>` has its own count:

```html
<demo-counter count="3" label="Tickets"></demo-counter>
<demo-counter count="8" label="Open issues"></demo-counter>
```

## Bundle and use components

Only files directly in `app/client/` are entries. Make one entry that imports
the component modules so the Rocket runtime is bundled once. Create
`app/client/components.ts`:

```ts
import "./components/counter";
```

Include that entry from a page with the generated `script()` helper:

```ts
import { script } from "@space/client";
import { definePage, html } from "spacefn/pages";

export default definePage(
	() =>
		html`<!doctype html>
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<title>Reusable counters</title>
					${script("components.ts")}
				</head>
				<body>
					<demo-counter count="3" label="Tickets"></demo-counter>
					<demo-counter count="8" label="Open issues"></demo-counter>
				</body>
			</html>`,
);
```

That is the full integration: Vite bundles the component entry and the
Rocket/Datastar bundle, and the browser upgrades the custom elements when the
entry loads. No separate component runtime or framework configuration is
needed. Use `setup` for per-instance state and cleanup; use `onFirstRender`
when code needs rendered refs or mounted DOM. See the [Rocket reference](https://data-star.dev/reference/rocket)
for codecs, slots, events, shadow DOM, and lifecycle details.

## Start from the official examples

Before building a component from scratch, browse the
[Datastar examples](https://data-star.dev/examples/active_search). They cover
roughly 80% of the component patterns most apps need, from search and forms to
interactive widgets. For a more advanced example, the
[Rocket virtual scroller](https://data-star.dev/examples/rocket_virtual_scroll)
handles very large lists by recycling a small number of DOM blocks.

For community-built Rocket components with source code, see the
[Starbase component collection](https://starbase.zweiundeins.gmbh/#components).

## Keep page interactions server-first

Use Rocket for reusable browser components, not as a replacement for the
server. Pages still render initial HTML, and colocated `*.server.ts` actions
remain the place for validation, authorization, persistence, and server
responses. A component can call Datastar actions and morph server-rendered
fragments as needed.

## Further reading

- [Datastar guide](./datastar.md)
- [Datastar Rocket reference](https://data-star.dev/reference/rocket)
- [Client bundles](../directory-structure/client.md)
