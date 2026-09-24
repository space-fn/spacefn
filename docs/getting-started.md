# Getting started

## Requirements

- Node.js 20 or newer
- npm, pnpm, yarn, or bun
- A Cloudflare Workers-compatible Web API runtime for deployment

## Create a project

```bash
npm create spacefn@latest
# pnpm create spacefn@latest and yarn create spacefn@latest are also supported
```

The CLI asks for a project directory and package manager, writes the minimal template, and installs dependencies. Start it with the generated scripts:

```bash
cd my-project
pnpm dev
```

`spacefn dev` starts Vite. It scans the project, writes `.space/` modules, and serves the generated server handler. `.space/` is generated output; never edit it manually.

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

The file maps to `/`. `src/routes/books/[id].ts` maps to `/books/:id`; the handler receives the Web `Request`. Route patterns match the path but do not inject named parameters into the handler. See [framework](./framework.md) for the complete handler contract.

## First page

Pages split server data/actions from the HTML component:

```text
src/pages/about.server.ts
src/pages/about.page.ts
```

```ts
// src/pages/about.server.ts
export async function loader() {
	return { title: "About" };
}
```

```ts
// src/pages/about.page.ts
import { h, type HtmlElement } from "@spacefn/html";

export default function About(data: { title: string }): HtmlElement {
	return h.html({}, h.body({}, h.h1({}, data.title)));
}
```

The page is available at `/about`. A `.server.ts` file is optional; a `.page.ts` file is optional. A page without a component can still expose loader/action data.

## First middleware

Create `src/middlewares/01-logging.ts`:

```ts
import type { MiddlewareHandler } from "@spacefn/server";

const logging: MiddlewareHandler = async (request, next) => {
	const started = Date.now();
	const response = await next();
	console.log(request.method, new URL(request.url).pathname, Date.now() - started);
	return response;
};

export default logging;
```

Numeric prefixes sort middleware. Middleware can return a response without calling `next()` to short-circuit a request.

## Production build

```bash
pnpm build
```

The command invokes Vite with the SpaceFn plugin and generates the production bundle. Select the resulting module in your Cloudflare Workers deployment configuration. The generated app uses Web `Request`/`Response` APIs and does not require Node request globals.

## Troubleshooting

- Delete `.space/` and rerun `pnpm dev` if generated output is stale.
- Check that route/page files export the expected default handler/component.
- Check the terminal for Vite and generator errors before debugging the request handler.
