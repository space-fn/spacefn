# Getting Started

Build a Cloudflare Workers app with Space. This guide covers setup, first route, and deployment.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 12+

## 1. Create a Project

```bash
git clone <repo-url> && cd space
pnpm install
```

## 2. Project Structure

```
space/
  src/
    routes/
      index.ts          # GET /
      api/
        users.ts        # GET /api/users
    middlewares/
      1.logger.ts       # Runs first (logging)
      2.cors.ts         # Runs second (CORS headers)
    main.ts             # Entry point
  wrangler.toml         # Cloudflare config
```

## 3. Write a Route

Create `src/routes/index.ts`:

```ts
import { h, render } from "@spacefn/html";

export default function () {
	return new Response(
		render(
			h.html(
				{},
				h.head({}, h.title({}, "Home")),
				h.body({}, h.h1({}, "Hello from Space"), h.p({}, "This page is server-rendered.")),
			),
		),
		{ headers: { "Content-Type": "text/html" } },
	);
}
```

## 4. Add Interactivity

Add DataStar for client-side reactivity:

```ts
import { h, render } from "@spacefn/html";
import { ds } from "@spacefn/datastar";

export default function () {
	return new Response(
		render(
			h.html(
				{},
				h.head({}, h.title({}, "Counter")),
				h.body(
					{},
					h.div(
						ds.dataSignals({ count: 0 }),
						h.button(ds.dataOn("click", "$count++"), "Count: ", h.span(ds.dataText("$count"), "0")),
					),
				),
			),
		),
		{ headers: { "Content-Type": "text/html" } },
	);
}
```

## 5. Add a Server Endpoint

Create `src/routes/api/counter.post.ts`:

```ts
import { readSignals } from "@spacefn/datastar/server";
import { datastarSSE } from "@spacefn/datastar/server";

export default async function (request: Request) {
	const signals = await readSignals<{ count: number }>(request);
	const sse = datastarSSE();
	sse.patchSignals({ count: signals.count + 1 });
	return sse.toResponse();
}
```

## 6. Start Development

```bash
pnpm dev
```

Vite starts a dev server. Route and middleware files are scanned automatically. Changes trigger regeneration and hot reload.

## 7. Deploy

```bash
pnpm build
pnpm deploy
```

Wrangler uploads the built output to Cloudflare Workers.

## Next Steps

- [Routes](../packages/server/docs/routes.md) — File naming conventions
- [Middlewares](../packages/server/docs/middlewares.md) — Request preprocessing
- [@spacefn/html](../packages/html/README.md) — HTML generation
- [@spacefn/css](../packages/css/README.md) — Design tokens and styles
- [@spacefn/datastar](../packages/datastar/README.md) — Client reactivity + server SSE
