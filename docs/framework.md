# SpaceFn framework

`@spacefn/server` builds a Web API handler from route, page, and middleware definitions. `@spacefn/server/vite` scans source files and generates the modules consumed by `src/main.ts`.

## Entry point

```ts
import { createServer } from "@spacefn/server";
import middlewares from "#space/middlewares";
import pages from "#space/pages";
import routes from "#space/routes";

export default createServer({ routes, pages, middlewares });
```

The generated modules expose both named and default exports:

- `routes` from `#space/routes`
- `pages` from `#space/pages`
- `middlewares` from `#space/middlewares`

`createServer` returns `(request: Request) => Promise<Response>`, suitable for Cloudflare Workers, tests, and other Web API runtimes.

## Routes

Routes are scanned from `src/routes/**/*.ts` by default. The relative file path becomes the URL pattern:

| File                             | Pattern         |
| -------------------------------- | --------------- |
| `src/routes/index.ts`            | `/`             |
| `src/routes/books.ts`            | `/books`        |
| `src/routes/books/[id].ts`       | `/books/:id`    |
| `src/routes/assets/[...path].ts` | `/assets/*path` |

A route can export a default module or method-specific exports:

```ts
import { h, render } from "@spacefn/html";

export async function GET(request: Request) {
	return new Response(render(h.p({}, request.method)));
}

export async function POST(request: Request) {
	return new Response("created", { status: 201 });
}
```

A default export is used when no method-specific export matches. Methods are case-insensitive and an unmatched method returns `404`.

## Pages

Pages are scanned from `src/pages/**/*.server.ts` and `src/pages/**/*.page.ts`. Matching files combine into one page definition:

```ts
// src/pages/profile.server.ts
import { defineActions, defineLoader } from "@spacefn/server";

export const loader = defineLoader(async (request: Request) => ({
	user: await loadUser(request),
}));

export const actions = defineActions({
	save: {
		resolver: async (payload) => saveProfile(payload),
	},
});
```

```ts
// src/pages/profile.page.ts
import { h, type HtmlElement } from "@spacefn/html";

export default function Profile(data: { user: { name: string } }): HtmlElement {
	return h.html({}, h.body({}, h.h1({}, data.user.name)));
}
```

The page is available at `/profile`. A `.server.ts` file is optional; a `.page.ts` file is optional. A page without a component can still expose loader/action data. POST actions are selected with the `_action` query parameter. Request bodies are parsed as multipart form data for multipart actions, otherwise JSON first and URL-encoded form data as a fallback. Invalid or missing actions return `400`; an unknown route returns `404`.

## Middleware

Middleware is scanned from `src/middlewares/**/*.ts` and ordered lexically. Prefix files with numbers when order matters (`01-auth.ts`, `02-logging.ts`). A middleware has this shape:

```ts
import type { MiddlewareHandler } from "@spacefn/server";

const auth: MiddlewareHandler = async (request, next) => {
	if (!request.headers.get("authorization")) return new Response("Unauthorized", { status: 401 });
	return next();
};

export default auth;
```

The server composes middleware around the router. Calling `next()` exactly once continues the chain; returning a response short-circuits it. Calling `next()` twice from one middleware is rejected and handled by the configured error handler.

## Vite integration

```ts
import { defineConfig } from "vite";
import { space } from "@spacefn/server/vite";

export default defineConfig({
	plugins: [...space()],
});
```

`space()` returns the generator plugin plus the dev-server middleware. The server plugin currently accepts `root`; it scans the conventional `src/routes`, `src/pages`, and `src/middlewares` directories. Generated outputs default to `.space/`.

The CLI uses the same plugin internally:

```bash
spacefn dev
spacefn build
```

## Error handling

Pass `onError` to `createServer` to control uncaught handler and middleware errors:

```ts
const server = createServer({
	routes,
	onError(error, request) {
		console.error(error);
		return new Response("Internal Server Error", { status: 500 });
	},
});
```

## Related packages

- [`@spacefn/html`](./html.md) renders escaped HTML and components.
- [`@spacefn/css`](./css.md) produces deterministic classes and CSS.
- [`@spacefn/datastar`](./datastar.md) adds DataStar interactions and SSE.
- [`@spacefn/db`](./db.md) scans schema definitions and generates migrations.
