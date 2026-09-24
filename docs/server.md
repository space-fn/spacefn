# @spacefn/server

`@spacefn/server` is the runtime for SpaceFn's file-based routes, pages, and middleware. It is intentionally based on the Web `Request` and `Response` APIs.

## Install

```bash
pnpm add @spacefn/server
```

For file scanning and Vite integration:

```bash
pnpm add -D @spacefn/server vite
```

## Runtime API

```ts
import { createServer } from "@spacefn/server";

const server = createServer({
	routes: [
		{
			pattern: "/health",
			method: "get",
			handler: async () => ({ default: () => new Response("ok") }),
		},
	],
});

const response = await server(new Request("https://example.com/health"));
```

A route handler may return a module-like object whose `default` export handles the request. Page routes use the `loader`, `actions`, and rendered `page` fields instead. `createServer` returns a Web API handler and supports `onError` for uncaught failures.

## Generated application

Use the Vite integration for file-based applications:

```ts
import { createServer } from "@spacefn/server";
import middlewares from "#space/middlewares";
import pages from "#space/pages";
import routes from "#space/routes";

export default createServer({ routes, pages, middlewares });
```

See [framework.md](./framework.md) for file patterns and handler contracts.

## Deployment

The runtime has no Node request dependency. Export the handler from the worker entry point expected by your deployment adapter. The CLI commands are:

```bash
spacefn dev
spacefn build
```

`spacefn build` delegates to Vite with the SpaceFn plugin. Configure the final worker entry/output in the deployment tool used by your project.
