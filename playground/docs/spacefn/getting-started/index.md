# Getting started

This guide takes you from an empty folder to a running app in a few minutes.

## 1. Create a project

```sh
npm create spacefn my-app
cd my-app
```

This copies the template into `my-app`; it does not install dependencies. Install
the packages, then start the app:

```sh
cd my-app
pnpm install
```

The template declares its own `hono`, `cf` and `@cloudflare/vite-plugin`
versions. You can upgrade them directly for security patches without waiting
for a `spacefn` release.

## 2. Run it

```sh
pnpm dev
```

Open the URL it prints. You now have a working app on `workerd`.

## 3. Add a route

Create `app/routes/hello.ts`:

```ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(() => {
	return { message: "hello" };
});
```

Visit `/hello`. The route is picked up automatically - no registration needed.

## 4. Add a page

Create `app/pages/welcome.page.ts`:

```ts
import { html } from "spacefn/html";

export default () => html`<h1>Hello</h1>`;
```

Visit `/welcome`. The page and the `/hello` route cannot share a path; if you
name this file `hello.page.ts`, the build reports the conflict.

## 5. Add an interactive page

Pages can use Datastar attributes and colocated server actions. Create
`app/pages/counter.page.ts`:

```ts
import { definePage, html } from "spacefn/pages";

import { actions } from "./counter.server";

export default definePage(
	() =>
		html`<div>
			<script
				type="module"
				src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.4/bundles/datastar.js"
			></script>
			<main data-signals="{count: 0}">
				<p>Count: <span data-text="$count">0</span></p>
				<button type="button" data-on:click="$count++">Increment in browser</button>
				<button type="button" data-on:click="@post('${actions.check.path()}')">
					Check on server
				</button>
				<p id="server-count">Not checked yet.</p>
			</main>
		</div>`,
);
```

Create `app/pages/counter.server.ts`:

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

Datastar sends the signal to the page action, and the returned fragment
updates the matching ID. See [Datastar](../guides/datastar.md) for forms,
search, SSE, and PWA examples.

## 6. Add data

When the app needs persistent state, add a database migration and typed query
files under `app/db/<name>/`. The [Todo board example](../examples/todo-crud.md)
shows the full D1 setup, loader, actions, and Datastar fragments.

## 7. Build and deploy

Use the scaffolded Cloudflare beta CLI commands:

```sh
pnpm run build
pnpm cf preview
pnpm cf deploy
```

Set the Dashboard build command to `pnpm run build`, deploy command to
`pnpm cf deploy`, preview command to `pnpm cf preview`, and root directory to
`/`. Add production secrets in Cloudflare's Dashboard; see the
[deployment guide](../guides/deployment.md).

## 8. Where to go next

- [Project structure](./project-structure.md) - what each folder does.
- [Directory structure](../directory-structure/) - every convention folder in detail.
- [How it works](../concepts/how-it-works.md) - what spacefn does under the hood.
- [API reference](../api-reference/) - exact signatures.
- [Examples cookbook](../examples/) - complete feature walkthroughs.
