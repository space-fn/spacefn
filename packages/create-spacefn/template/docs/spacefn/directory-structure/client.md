# Client bundles

Use Datastar attributes for most interactions. For complex, highly interactive
and reusable components, use [Rocket](../guides/datastar-components.md) in
`app/client/`. Put additional browser-only code there as well.

An entry is setup like any other `app/` file: it finds elements, attaches
listeners, and calls your code. Validation, formatting, and other rules live in
`modules/` or `utils/`, where the server can use the same function (see
[modules](./modules.md#shared-with-the-browser)).

## Layout

```txt
app/client/
├── tsconfig.json        → DOM lib for browser code
├── site.css             → entry   /_client/site.css
├── counter.ts           → entry   /_client/counter.js
├── components.ts        → entry   Rocket components
├── service-worker.js    → entry   registered with root scope
└── _dom.ts              → browser-only helper shared by entries, not an entry
```

- Only files directly in `app/client/` are entries (nested folders are not scanned). Files not starting with `_` are entries; JS/TS and CSS are both supported.
- Serving prefix is `/_client/`. Dev: unhashed, transformed on request. Build: content-hashed, CDN-cacheable.
- Import allowlist (checked transitively): `app/client/`, `modules/`, `utils/`, `lib/`, npm packages. `app/env.ts` and other server code are rejected. The same check runs in dev and build.

## Bundling

Entries are built with Vite.

- **Dev.** Files are served unhashed at `/_client/<name>` and transformed on request (TypeScript, CSS).
- **Build.** A Vite build emits content-hashed files into `_client/` (e.g. `counter-a1b2c3.js`, `site-d4e5f6.css`).
- **CSS.** A CSS entry is served as a stylesheet. CSS imported from a JavaScript or TypeScript entry is collected and linked by `script()` in production.
- **TypeScript.** `app/client/` has its own `tsconfig.json` with the DOM lib. Worker code keeps `@cloudflare/workers-types`.
- **Customization.** Pass Vite plugins, CSS tooling, etc. through `SpaceOptions.client` (the `client` field of the space config).

## Include an entry in a page

Use the generated helpers in `.space/client.ts`:

```ts
import { clientUrl, script, styles } from "@space/client";
import { html } from "spacefn/html";

// in a route handler returning HTML:
c.html(
	html`<head>
		${styles("site.css")}${script("counter.ts")}
	</head>`,
);
```

Assuming the build emits the example asset URLs below:

| Helper        | Call                             | Output                                                                                                                             | Use                                                                                     |
| ------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `script()`    | `script("counter.ts")`           | `<link rel="stylesheet" href="/_client/counter-d4e5f6.css">`<br>`<script type="module" src="/_client/counter-a1b2c3.js"></script>` | Execute a JavaScript or TypeScript entry; imported CSS links are included when present. |
| `styles()`    | `styles("site.css")`             | `<link rel="stylesheet" href="/_client/site-d4e5f6.css">`                                                                          | Add a CSS entry's stylesheet link(s). It can also link CSS imported by a JS/TS entry.   |
| `clientUrl()` | `clientUrl("service-worker.js")` | `/_client/service-worker-a1b2c3.js` _(a string, not HTML)_                                                                         | Get the asset URL for use in an attribute or client-side API.                           |

`ClientEntry` includes all entries; `ClientScriptEntry` includes only JavaScript and TypeScript entries accepted by `script()`. Names are generated unions, so typos and passing a CSS entry to `script()` are type errors.

## Examples

### A script and a stylesheet

```ts
// app/client/counter.ts

import { formatCount } from "@utils/format";

const button = document.querySelector<HTMLButtonElement>("#inc")!;
let count = 0;
button.addEventListener("click", () => {
	count += 1;
	button.textContent = formatCount(count);
});
```

```ts
// utils/format.ts — pure, so the server can render the same text
export function formatCount(n: number): string {
	return `count: ${n}`;
}
```

```css
/* app/client/site.css */
body {
	font-family: system-ui, sans-serif;
}
#inc {
	padding: 0.5rem 1rem;
}
```

```ts
// app/routes/counter-page.ts

import { script, styles } from "@space/client";
import { defineHandler } from "spacefn/handler";
import { html } from "spacefn/html";

export const GET = defineHandler((c) =>
	c.html(
		html`<!doctype html>
			<html>
				<head>
					<title>Counter</title>
					${styles("site.css")}
				</head>
				<body>
					<button id="inc">count: 0</button>
					${script("counter.ts")}
				</body>
			</html>`,
	),
);
```

### CSS imported by a script

CSS imported from a script travels with it. In a build, `script()` also emits the stylesheet link, so the page does not need a separate `styles()` call:

```ts
// app/client/widget.ts

import "./widget.css";

document.body.dataset.widget = "ready";
```

### Share code with the server

Browser code can import from `modules/`, `utils/` and `lib/`, so validation or formatting is written once:

```ts
// app/client/greeting.ts

import { greeting } from "@modules/greetings";

console.log(greeting("browser").message);
```

### Datastar, Rocket and PWA

- Datastar needs no entry file for most pages; see [Datastar](../guides/datastar.md).
- Reusable web components live in `app/client/` as Rocket entries; see [Datastar components](../guides/datastar-components.md).
- A service worker is also an entry; see the PWA section in the [Datastar guide](../guides/datastar.md).

## Service worker

Name a service worker entry `app/client/service-worker.js`. Spacefn adds the
`Service-Worker-Allowed: /` response header to this entry so it can be
registered with root scope. Use `clientUrl("service-worker.js")` to get its
URL, and `script()` to include a separate registration entry.

`app/client/tsconfig.json` uses the DOM lib; worker code keeps `@cloudflare/workers-types`. Files starting with `_` (e.g. `_dom.ts`) are browser-only helpers, not entries.

## Related

- [Generated API](../api-reference/generated.md) lists the types and helpers in `.space/client.ts`.
- [Import aliases](../concepts/import-aliases.md) explains `@modules/*` and friends.
