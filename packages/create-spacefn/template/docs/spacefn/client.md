# Client bundles

When DataStar is not enough, put browser code in `app/client/`.

- Files not starting with `_` are entries; JS/TS and CSS are both supported.
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
- Typos in entry names fail `vp check` (typed `ClientEntry` union).

`app/client/` has its own `tsconfig.json` with the DOM lib; worker code keeps `@cloudflare/workers-types`. Files starting with `_` (e.g. `_shared.ts`) are shared modules, not entries.
