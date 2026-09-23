# @spacefn/server

Meta framework for Cloudflare Workers. Convention-based routing with h3.

## Design Goals

1. **Web API standard** — Request/Response API compatible with Cloudflare Workers, Deno, and Bun
2. **Convention over configuration** — File-based route and middleware discovery
3. **Server-side rendering** — HTML generation with `@spacefn/html`
4. **Form actions** — Type-safe form handling with Zod validation
5. **Minimal runtime** — h3 router, no heavy framework abstractions

## Architecture

```
src/
  routes/
    index.ts          → GET /
    books/
      index.ts        → GET /books
      [slug].ts       → GET /books/:slug
  middlewares/
    auth.ts           → runs before routes
  pages/
    index.server.ts   → loader + actions + page component
  main.ts             → entry point
```

### File Convention

- `src/routes/*.ts` — Route handlers (pattern from file path)
- `src/middlewares/*.ts` — Middleware chain
- `src/pages/*.server.ts` — Page loaders and actions
- `*.page.ts` — Page components (optional, for SSR)

### Route Patterns

| File                         | Pattern          |
| ---------------------------- | ---------------- |
| `src/routes/index.ts`        | `/`              |
| `src/routes/books/index.ts`  | `/books`         |
| `src/routes/books/[slug].ts` | `/books/:slug`   |
| `src/routes/[...all].ts`     | `/*` (catch-all) |

## API

### `createServer(options)`

```ts
createServer({
  routes: Route[],
  pages?: PageRoute[],
  middlewares?: Middleware[],
  onError?: (error, request) => Response
})
```

Returns `(request: Request) => Promise<Response>`.

### Route

```ts
interface Route {
	pattern: string; // URL pattern (e.g., "/books/:slug")
	method: string; // HTTP method or "*" for all
	handler: () => Promise<{ default: RouteHandler }>;
}
```

### Middleware

```ts
interface Middleware {
	name: string;
	handler: (request: Request, next: NextFunction) => Response | Promise<Response>;
}
```

## Pages

Pages combine data loading, form actions, and rendering.

### Loader

```ts
// src/pages/dashboard.server.ts
import { defineLoader } from "@spacefn/server";

export const loader = defineLoader(async (req) => {
	const user = await getUser(req);
	return { name: user.name, notifications: user.notifications };
});
```

### Actions

```ts
// src/pages/dashboard.server.ts
import { defineActions } from "@spacefn/server";
import { z } from "zod";

export const actions = defineActions({
	markRead: {
		input: z.object({ id: z.string() }),
		resolver: async (payload) => {
			await markNotificationRead(payload.id);
			return { success: true };
		},
	},
});
```

### Form Dispatch

Actions are dispatched via `?_action=<name>`:

```html
<form method="POST" action="/dashboard?_action=markRead">
	<input type="hidden" name="id" value="123" />
	<button type="submit">Mark as Read</button>
</form>
```

## Vite Plugin

```ts
// vite.config.ts
import { space } from "@spacefn/server/vite";

export default {
	plugins: [space()],
};
```

Scans `src/routes/`, `src/middlewares/`, and `src/pages/`. Generates:

- `.space/routes.ts` — route definitions
- `.space/middlewares.ts` — middleware imports
- `.space/pages.ts` — page route definitions

## Aliases

Generated files are aliased with `#space/`:

```ts
import routes from "#space/routes";
import middlewares from "#space/middlewares";
import pages from "#space/pages";
```

## CLI

```bash
spacefn dev     # Start Vite dev server
spacefn build   # Build for Cloudflare Workers
```
