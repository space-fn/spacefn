# Getting started

## Requirements

- Node.js 20 or newer
- pnpm, npm, yarn, or bun
- A Cloudflare Workers-compatible Web API runtime for deployment

## Install

```bash
pnpm add @spacefn/asteroids hono
pnpm add -D @spacefn/cli @spacefn/vite-plugin @biomejs/biome vite vitest @cloudflare/vite-plugin
```

Or install individual packages:

```bash
pnpm add @spacefn/html @spacefn/css @spacefn/datastar @spacefn/db hono
```

## Project structure

```
my-app/
├── src/
│   ├── routes/
│   │   └── index.ts          # GET/POST handlers
│   ├── pages/
│   │   ├── home.page.ts      # Page component
│   │   └── home.server.ts    # Loader + actions
│   ├── middlewares/
│   │   └── 01-logging.ts     # Request middleware
│   ├── db/
│   │   └── schema.ts         # Database schema
│   └── worker.ts             # Hono entry point
├── scripts/                   # Custom CLI scripts
├── biome.json                 # Linter/formatter config
├── vite.config.ts
└── package.json
```

## First route

Create `src/routes/index.ts`:

```ts
import { h, render } from "@spacefn/html";

export default function GET() {
  return new Response(
    render(h.html({}, h.head({}, h.title({}, "Home")), h.body({}, h.h1({}, "Hello from SpaceFn")))),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
```

The file maps to `/`. `src/routes/books/[id].ts` maps to `/books/:id`; the handler receives the Web `Request`.

## First page

Pages use Hono with typed loaders and actions:

```ts
// src/pages/about.server.ts
import { defineLoader, defineActions } from "@spacefn/asteroids/hono";

export const loader = defineLoader(async (c) => {
  return { title: "About" };
});

export const actions = defineActions({
  submit: {
    resolver: async (c) => {
      // Handle form submission
      return new Response("Saved");
    },
  },
});
```

```ts
// src/pages/about.page.ts
import { definePage } from "@spacefn/asteroids/hono";
import { h } from "@spacefn/asteroids";

export default definePage<{ title: string }>((data) =>
  h.html({}, h.body({}, h.h1({}, data.title))),
);
```

## First middleware

Create `src/middlewares/01-logging.ts`:

```ts
import type { MiddlewareHandler } from "hono";

const logging: MiddlewareHandler = async (c, next) => {
  const started = Date.now();
  await next();
  console.log(c.req.method, c.req.path, Date.now() - started);
};

export default logging;
```

Numeric prefixes sort middleware. Middleware can short-circuit by returning a response without calling `next()`.

## Entry point

Create `src/worker.ts`:

```ts
import { Hono } from "hono";
import { html } from "@spacefn/asteroids/hono";
import { h } from "@spacefn/asteroids";

const app = new Hono();

app.get("/", (c) => {
  return html(
    h.html(
      {},
      h.head({}, h.title({}, "My App")),
      h.body({}, h.h1({}, "Hello from SpaceFn!")),
    ),
  );
});

export default app;
```

## CLI commands

```bash
space dev          # Start dev server
space build        # Build for production
space test         # Run tests with Vitest
space fmt          # Format code with Biome
space lint         # Lint code with Biome
space check        # Run all checks
space run <name>   # Run custom script from scripts/
```

See [cli.md](./cli.md) for the full CLI reference.

## Production build

```bash
space build
```

The command invokes Vite with the Cloudflare Workers plugin and generates the production bundle. Configure `wrangler.jsonc` for deployment.

## Troubleshooting

- Check that route/page files export the expected default handler/component.
- Check the terminal for Vite and generator errors before debugging the request handler.
- Run `space check` to catch formatting, lint, and type errors.
