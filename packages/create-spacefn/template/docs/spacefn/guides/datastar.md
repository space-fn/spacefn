# Datastar

Datastar is the recommended frontend for interactive spacefn apps. It fits the
stack's server-first model: render HTML in the Worker, use small `data-*`
attributes for browser reactivity, and let the server update the page with HTML
fragments or Server-Sent Events (SSE). You do not need a component framework or
a client-side router.

Use `app/pages/<name>.page.ts` for the page and its colocated
`app/pages/<name>.server.ts` for its loader and actions. Datastar actions post
back to that page. `actions.<name>.path()` gives you the action query string, so
you do not need to hard-code URLs or create a separate `app/routes/` endpoint
for each interaction.

## Load Datastar

For a quick start, add the pinned browser bundle to the page. This example uses
Datastar v1.0.4:

```html
<script
	type="module"
	src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.4/bundles/datastar.js"
></script>
```

For production, prefer hosting a pinned bundle yourself rather than depending
on a third-party CDN at runtime. Follow the [official installation guide](https://data-star.dev/guide/getting_started)
for current bundle options. Datastar does not require an npm dependency for
these examples.

## A page and its first action

Create `app/pages/counter.page.ts`:

```ts
import { definePage, html } from "spacefn/pages";

import { actions } from "./counter.server";

export default definePage(
	() =>
		html`<!doctype html>
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<title>Datastar counter</title>
					<script
						type="module"
						src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.4/bundles/datastar.js"
					></script>
				</head>
				<body>
					<main data-signals="{count: 0}">
						<p>Count: <span data-text="$count">0</span></p>
						<button type="button" data-on:click="$count++">Increment</button>
						<button type="button" data-on:click="@post('${actions.check.path()}')">
							Check on server
						</button>
						<p id="server-count">The server has not checked the count yet.</p>
					</main>
				</body>
			</html>`,
);
```

Create the colocated `app/pages/counter.server.ts`:

```ts
import { defineActions, html } from "spacefn/pages";

export const actions = defineActions({
	check: async (c) => {
		const body = await c.req.json<{ datastar?: { count?: unknown } }>();
		const count = body.datastar?.count;
		if (typeof count !== "number" || !Number.isSafeInteger(count)) {
			return c.json({ error: "invalid_count" }, 400);
		}

		return c.html(html`<p id="server-count">Server checked: ${count}</p>`);
	},
});
```

`data-signals` initializes browser state. `data-text` reacts to it, and
`data-on:click` runs an expression when the button is clicked. Datastar sends
signals with backend actions by default; this `POST` action receives them in a
JSON `datastar` object. Validate them before use.

`actions.check.path()` returns `?_action=check`. Because the action URL is
relative, Datastar posts to the current page with the right action name. Return
a `Response` containing a fragment to let Datastar update the page; returning
nothing from a page action instead redirects with `303`.

For a counter that does not need the server, remove the second button and its
server action. The signal and increment button work entirely in the browser.
For reusable, highly interactive components, use [Rocket](./datastar-components.md).

## Submit a form and patch the result

`contentType: 'form'` sends the closest form's values as
`application/x-www-form-urlencoded`. The page action reads them with
`c.req.formData()` and returns the element to morph.

Create `app/pages/preview.page.ts`:

```ts
import { definePage, html } from "spacefn/pages";

import { actions } from "./preview.server";

export default definePage(
	() =>
		html`<main>
			<form data-on:submit__prevent="@post('${actions.preview.path()}', {contentType: 'form'})">
				<label>
					Message
					<input name="message" required />
				</label>
				<button type="submit">Preview</button>
			</form>
			<output id="message-preview">Your preview will appear here.</output>
		</main>`,
);
```

Create `app/pages/preview.server.ts`:

```ts
import { defineActions, html } from "spacefn/pages";

export const actions = defineActions({
	preview: async (c) => {
		const form = await c.req.formData();
		const message = String(form.get("message") ?? "").trim();

		if (!message) {
			return c.html(
				html`<output id="message-preview" role="alert">Enter a message first.</output>`,
			);
		}

		return c.html(html`<output id="message-preview">${message}</output>`);
	},
});
```

`data-on:submit__prevent` prevents full-page navigation. Datastar sends the
form to the `preview` page action and morphs the matching `<output>`. The `html`
template escapes submitted text. Keep server-side validation and authorization
even when the browser also has `required` or other client-side checks.

## Search as the user types

Signals are sent with a `POST` action by default, so the search term does not
need to be manually encoded in a URL. Debounce input to avoid sending a request
for every keystroke.

Create `app/pages/search.page.ts`:

```ts
import { definePage, html } from "spacefn/pages";

import { actions } from "./search.server";

export default definePage(
	() =>
		html`<main data-signals="{query: ''}">
			<label>
				Search
				<input
					type="search"
					data-bind:query
					data-on:input__debounce.250ms="@post('${actions.search.path()}')"
				/>
			</label>
			<ul id="search-results"></ul>
		</main>`,
);
```

Create `app/pages/search.server.ts`:

```ts
import { defineActions, html } from "spacefn/pages";

const entries = ["Cloudflare Workers", "Datastar", "spacefn"];

export const actions = defineActions({
	search: async (c) => {
		const body = await c.req.json<{ datastar?: { query?: unknown } }>();
		const query = body.datastar?.query;
		if (typeof query !== "string") {
			return c.json({ error: "invalid_query" }, 400);
		}

		const matches = entries.filter((entry) =>
			entry.toLowerCase().includes(query.trim().toLowerCase()),
		);
		return c.html(
			html`<ul id="search-results">
				${matches.map((entry) => html`<li>${entry}</li>`)}
			</ul>`,
		);
	},
});
```

The action returns a small HTML fragment with the same ID as the existing
results list. For real data, bound the query length and use parameterized
database queries. Do not interpolate user input into SQL or into `raw()` HTML.

## Stream a patch with SSE

Use SSE when an action needs to send a sequence of updates or keep a connection
open. Datastar listens for its `datastar-patch-elements` event; Hono's
`streamSSE` handles the event-stream response framing.

Create `app/pages/time.page.ts`:

```ts
import { definePage, html } from "spacefn/pages";

import { actions } from "./time.server";

export default definePage(
	() =>
		html`<main>
			<button type="button" data-on:click="@post('${actions.refresh.path()}')">
				Refresh server time
			</button>
			<p id="server-time">Not requested yet.</p>
		</main>`,
);
```

Create `app/pages/time.server.ts`:

```ts
import { streamSSE } from "hono/streaming";
import { defineActions, html } from "spacefn/pages";

export const actions = defineActions({
	refresh: (c) =>
		streamSSE(c, async (stream) => {
			const fragment = html`<p id="server-time">${new Date().toISOString()}</p>`;
			// Datastar reads each line of a patch from its own `elements` prefix.
			await stream.writeSSE({
				event: "datastar-patch-elements",
				data: fragment.value
					.split("\n")
					.map((line) => `elements ${line}`)
					.join("\n"),
			});
		}),
});
```

For a persistent stream, keep writing Datastar patch events until the client
disconnects and release any subscriptions in the stream's abort handler. See
[Server-Sent Events](../examples/server-sent-events.md) for route streams and
Durable Object fan-out.

## Add a PWA offline response

Datastar uses normal HTTP requests and HTML responses, so a service worker can
intercept a request and return a small HTML fragment when the network is
unavailable. The browser does not need a PWA runtime. This example makes the
page installable and provides an offline response for a read-only Datastar
action.

Add a manifest link and service worker registration to a page such as
`app/pages/pwa.page.ts`:

```ts
import { clientUrl, script } from "@space/client";
import { definePage, html } from "spacefn/pages";

import { actions } from "./pwa.server";

export default definePage(
	() =>
		html`<!doctype html>
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<link rel="manifest" href="/manifest" />
					<meta name="service-worker" content="${clientUrl("service-worker.js")}" />
					<title>Datastar PWA</title>
					<script
						type="module"
						src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.4/bundles/datastar.js"
					></script>
				</head>
				<body>
					<main>
						<button type="button" data-on:click="@post('${actions.ping.path()}')">
							Check connection
						</button>
						<p id="connection-status" role="status">Ready.</p>
					</main>
					${script("register-service-worker.ts")}
				</body>
			</html>`,
);
```

The registration code is a normal client entry at
`app/client/register-service-worker.ts`:

```ts
const workerUrl = document.querySelector<HTMLMetaElement>('meta[name="service-worker"]')?.content;

if ("serviceWorker" in navigator && workerUrl) {
	navigator.serviceWorker
		.register(workerUrl, { scope: "/", type: "module" })
		.catch((error) => console.error("Service worker registration failed", error));
}
```

The page's colocated `app/pages/pwa.server.ts` handles the normal online
response:

```ts
import { defineActions, html } from "spacefn/pages";

export const actions = defineActions({
	ping: (c) => c.html(html`<p id="connection-status" role="status">Worker response received.</p>`),
});
```

Add a manifest at `app/routes/manifest.ts`. This route serves PWA metadata; it
is not a Datastar action:

```ts
import { defineHandler } from "spacefn/handler";

const manifest = {
	name: "Datastar PWA",
	short_name: "Datastar",
	start_url: "/pwa",
	scope: "/",
	display: "standalone",
	theme_color: "#ffffff",
	background_color: "#ffffff",
	icons: [
		{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
		{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
	],
};

export const GET = defineHandler(
	() =>
		new Response(JSON.stringify(manifest), {
			headers: { "content-type": "application/manifest+json" },
		}),
);
```

Replace the icon paths with your app's icons. Put the worker itself in
`app/client/service-worker.js`:

```js
self.addEventListener("fetch", (event) => {
	const request = event.request;
	const url = new URL(request.url);
	if (
		request.method !== "POST" ||
		request.headers.get("Datastar-Request") !== "true" ||
		url.pathname !== "/pwa" ||
		url.searchParams.get("_action") !== "ping"
	) {
		return;
	}

	event.respondWith(
		fetch(request).catch(
			() =>
				new Response(
					'<p id="connection-status" role="status">Offline. Try again when connected.</p>',
					{ headers: { "content-type": "text/html; charset=utf-8" } },
				),
		),
	);
});
```

`clientUrl("service-worker.js")` resolves the hashed client entry URL. Spacefn
adds `Service-Worker-Allowed: /` for this entry in development and production,
so it can control the app even though client assets are served under
`/_client/`. Use `script()` to embed the registration entry, not the service
worker itself.

When the `ping` request fails at the network layer, the service worker returns
HTML with the same ID as the online response. Datastar applies it just like any
other fragment. The manifest route only serves PWA metadata; Datastar actions
still live in `*.server.ts`.

This example does not queue or replay mutations. For an offline-first app,
cache a public app shell and host the Datastar bundle locally; persist and
reconcile user changes explicitly rather than reporting an offline mutation as
successful. A service worker requires HTTPS in production; Cloudflare
deployments already use HTTPS.

## Recommended approach

- Use `*.page.ts` for markup and colocated `*.server.ts` for its loader and
  Datastar actions.
- Use `actions.<name>.path()` in the page instead of hard-coding
  `?_action=<name>`.
- Return HTML fragments or an SSE `Response` from Datastar actions. Returning
  nothing triggers the normal page-action `303` redirect.
- Put durable state and business rules in server actions and the data layer.
  Browser signals are UI state, not trusted application state.
- Render untrusted values with `html` and avoid `raw()` for user content.
- Protect mutations with the same authentication, authorization, validation,
  and CSRF strategy as any other endpoint.
- Keep server-only modules out of `app/client/`. Datastar's attributes do not
  need a client entry; use [client bundles](../directory-structure/client.md)
  only for additional browser-only code.

## Further reading

- [Datastar getting started](https://data-star.dev/guide/getting_started)
- [Datastar attributes](https://data-star.dev/reference/attributes)
- [Datastar actions](https://data-star.dev/reference/actions)
- [Datastar SSE events](https://data-star.dev/reference/sse_events)
- [Rocket components](./datastar-components.md)
- [spacefn pages](../directory-structure/pages.md)
- [spacefn HTML API](../api-reference/html.md)
