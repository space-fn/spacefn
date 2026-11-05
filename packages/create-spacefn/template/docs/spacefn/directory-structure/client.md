# Client bundles

Use Datastar attributes for most interactions. For complex, highly interactive
and reusable components, use [Rocket](../guides/datastar-components.md) in
`app/client/`. Put additional browser-only code there as well.

- Only files directly in `app/client/` are entries (nested folders are not scanned). Files not starting with `_` are entries; JS/TS and CSS are both supported.
- Import allowlist (checked transitively): `app/client/`, `modules/`, `utils/`, `lib/`, npm packages. `app/env.ts` and other server code are rejected.
- Serving prefix is `/_client/`. Dev: unhashed, transformed on request. Build: content-hashed, CDN-cacheable.

## Bundling

Entries are built with Vite. Each top-level file in `app/client/` (not `_`-prefixed) becomes an entry point; nested folders are shared modules, not entries.

- **Dev.** Files are served unhashed at `/_client/<name>` and transformed on request (TypeScript, CSS). The import allowlist is checked on the dev graph walk too.
- **Build.** A Vite build emits content-hashed files into `_client/` (e.g. `counter-a1b2c3.js`, `site-d4e5f6.css`). `script()` emits a module script plus links to CSS imported by that entry; `styles()` emits stylesheet links.
- **Import allowlist.** Checked transitively: `app/client/`, `modules/`, `utils/`, `lib/`, and npm packages. `app/env.ts` and other server code are rejected. The same predicate runs in dev and build.
- **CSS.** A CSS entry is served as a stylesheet. CSS imported from a JavaScript or TypeScript entry is collected and linked by `script()` in production.
- **TypeScript.** `app/client/` has its own `tsconfig.json` with the DOM lib. Worker code keeps `@cloudflare/workers-types`.
- **Customization.** Pass Vite plugins, CSS tooling, etc. through `SpaceOptions.client` (the `client` field of the space config).

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

- `ClientEntry` includes all entries; `ClientScriptEntry` includes only JavaScript and TypeScript entries accepted by `script()`. Names are generated unions, so typos and passing a CSS entry to `script()` are type errors.

Name a service worker entry `app/client/service-worker.js`. Spacefn adds the
`Service-Worker-Allowed: /` response header to this entry so it can be
registered with root scope. Use `clientUrl("service-worker.js")` to get its
URL, and `script()` to include a separate registration entry.

`app/client/tsconfig.json` uses the DOM lib; worker code keeps `@cloudflare/workers-types`. Files starting with `_` (e.g. `_shared.ts`) are shared modules, not entries.

## Example

```ts
// app/client/counter.ts
import { greet } from "@modules/greet";

const button = document.querySelector<HTMLButtonElement>("#inc")!;
let count = 0;
button.addEventListener("click", () => {
	count += 1;
	button.textContent = `Clicked ${count}`;
	greet();
});
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
