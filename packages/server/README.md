# @spacefn/server

Meta framework for Cloudflare Workers. Convention-based routing with h3. Server-rendered HTML with DataStar.

## Install

```bash
pnpm add @spacefn/server
```

## Quick Start

### 1. Create Entry Point

```ts
// src/main.ts
import { createServer } from "@spacefn/server";
import routes from "#space/routes";
import middlewares from "#space/middlewares";

export default createServer({ routes, middlewares });
```

### 2. Add a Route

```ts
// src/routes/index.ts
import { html, head, body, h } from "@spacefn/html";

export default function () {
	return new Response(html({}, head(), body({}, h.h1({}, "Hello"))), {
		headers: { "Content-Type": "text/html" },
	});
}
```

### 3. Configure Vite

```ts
// vite.config.ts
import { space } from "@spacefn/server/vite";

export default {
	plugins: [space()],
};
```

### 4. Run

```bash
pnpm dev    # Development server
pnpm build  # Production build
```

## API

### `createServer(options)`

```ts
createServer({
  routes: Route[],          // Route definitions
  middlewares?: Middleware[], // Middleware chain
  onError?: (error, request) => Response  // Error handler
}): (request: Request) => Promise<Response>
```

Returns a Web API handler compatible with Cloudflare Workers.

### `Route`

```ts
interface Route {
	pattern: string; // URL pattern (e.g., "/books/:slug")
	method: string; // HTTP method or "*" for all
	handler: () => Promise<{ default: RouteHandler }>;
}
```

### `Middleware`

```ts
interface Middleware {
	name: string;
	handler: (request: Request, next: NextFunction) => Response | Promise<Response>;
}
```

### `#space/*` Aliases

Generated files in `.space/` are aliased with `#space/`:

```ts
import routes from "#space/routes"; // .space/routes.ts
import middlewares from "#space/middlewares"; // .space/middlewares.ts
```

## Vite Plugin

```ts
import { space } from "@spacefn/server/vite"

space({
  root?: string  // Working directory (default: cwd)
})
```

Scans `src/routes/` and `src/middlewares/`. Generates route definitions in `.space/`. Composes `@spacefn/vite-plugin` internally.

## CLI

```bash
space dev     # Start Vite dev server
space build   # Build for production
```

## Documentation

- [Routes](./docs/routes.md) — File naming conventions
- [Middlewares](./docs/middlewares.md) — Middleware ordering and usage
