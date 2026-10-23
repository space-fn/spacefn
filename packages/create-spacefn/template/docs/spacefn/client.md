# Client bundles

When DataStar is not enough, put browser code in `app/client/`.

- Only files directly in `app/client/` are entries (nested folders are not scanned). Files not starting with `_` are entries; JS/TS and CSS are both supported.
- Import allowlist (checked transitively): `app/client/`, `modules/`, `utils/`, `lib/`, npm packages. `app/env.ts` and other server code are rejected.
- Serving prefix is `/_client/`. Dev: unhashed, transformed on request. Build: content-hashed, CDN-cacheable.

Use the generated helpers in `.space/client.ts`:

```ts
import { script, styles, clientUrl } from "@space/client";

// in a route handler returning HTML:
c.html(
	html`<head>
		${styles("site.css")}${script("counter.ts")}
	</head>`,
);
```

- `script("counter.ts")` emits a `<script type="module">` tag (plus `<link>` tags for any CSS the entry imports).
- `styles("site.css")` emits a `<link rel="stylesheet">` tag.
- Entry names are typed as a `ClientEntry` union in `.space/client.ts`, so a typo is a TypeScript error.

`app/client/` has its own `tsconfig.json` with the DOM lib; worker code keeps `@cloudflare/workers-types`. Files starting with `_` (e.g. `_shared.ts`) are shared modules, not entries.

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
