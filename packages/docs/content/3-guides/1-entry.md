# The entry

`app/entry.ts` says what runs with the file conventions: the services, what wraps every request, and how failures are answered. Every app has one, and it's yours. spacefn provides the pieces and never adds one you didn't list. The same file runs on Cloudflare and on Bun.

```ts [app/entry.ts]
import { app, databases, errorPage, staticFiles, telemetry } from "spacefn";
import { platform } from "spacefn/platform";

import Env from "#configs/env.ts";
import { manifest } from "#space/manifest.ts";

export default app(manifest, {
	services: [platform(manifest), Env.layer, databases(manifest), telemetry(manifest.name)],
	before: [staticFiles()],
	routes: [],
	onError: errorPage,
});
```

`manifest` is the file conventions as data, generated from `app/`: the routes and pages, the `_middleware.ts` files, queues, crons and databases. It's a plain object, so the entry can filter it or add to it before passing it on.

## `services`

The app's services, in order: each layer can use the ones listed before it, and routes, pages, queues and crons can use them all.

| Piece                      | What it gives                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform(manifest)`       | The target's `Kv`, `Blob`, `Queue`, `Bus`, `RateLimiter`, an `HttpClient`, and how databases connect. On Cloudflare also the Worker's vars and secrets as config, and `CloudflareEnv`. |
| `Env.layer`                | `configs/env.ts`, read and checked when the app starts.                                                                                                                                |
| `databases(manifest)`      | Every database in `app/db/`, migrated as its `config.json` says.                                                                                                                       |
| `telemetry(manifest.name)` | Traces, logs and metrics over OTLP, once `OTEL_EXPORTER_OTLP_ENDPOINT` is set. See [Deploying](../4-deploy.md).                                                                        |

Your own services go after them, so they can use everything above:

```ts [app/entry.ts]
import { Mailer } from "#lib/mailer.ts";

export default app(manifest, {
	services: [
		platform(manifest),
		Env.layer,
		databases(manifest),
		telemetry(manifest.name),
		Mailer.layer,
	],
});
```

Leave a piece out and it's gone: without `telemetry(...)` nothing is exported, and without `databases(manifest)` no database connects.

`spacefn/platform` is the same import on both targets. The spacefn Vite plugin hands it the `platform` of `spacefn/cloudflare` or `spacefn/bun`, by the `target` in `configs/vite.ts`.

## `before`

Middleware around every request, outside `app/routes/_middleware.ts`. `staticFiles()` serves the client build on Bun; on Cloudflare, the assets are served before the Worker runs, so it lets every request through.

## `routes`

Effect `HttpRouter` layers beside the file routes, for what a file per URL doesn't fit, such as an `HttpApi` with its OpenAPI document:

```ts [app/entry.ts]
import { HttpRouter, HttpServerResponse } from "effect/http";

export default app(manifest, {
	routes: [HttpRouter.add("GET", "/version", Effect.succeed(HttpServerResponse.text("1.4.0")))],
});
```

They get the same services, `before` and `app/routes/_middleware.ts` as file routes.

## `onError`

What a failed request answers with, given its `Cause`. `errorPage`, spacefn's, answers the HTTP errors (`NotFound`, `Unauthorized`, ...) with their status: an HTML page for a browser navigation, JSON otherwise. Anything else is logged and answered with an opaque `500`. A URL nothing serves arrives as `NotFound`.

```ts [app/entry.ts]
import { Cause, Effect, Option } from "effect";
import { HttpServerResponse } from "effect/http";
import { errorPage, NotFound } from "spacefn";

export default app(manifest, {
	onError: (cause) =>
		Option.match(Cause.findErrorOption(cause), {
			onSome: (error) =>
				error instanceof NotFound
					? Effect.succeed(HttpServerResponse.text("Nothing here", { status: 404 }))
					: errorPage(cause),
			onNone: () => errorPage(cause),
		}),
});
```

## Target options

`bun` and `cloudflare` hold what only one target reads, so the file stays the same on both:

```ts [app/entry.ts]
export default app(manifest, {
	bun: { port: 8080, hostname: "127.0.0.1", idleTimeout: 120 },
	cloudflare: {
		handlers: {
			email: async (message, env, ctx) => {
				/* ... */
			},
		},
	},
});
```

`bun.port` defaults to `PORT`, else 3000. `cloudflare.handlers` adds Worker handlers beside the `fetch`, `queue` and `scheduled` that spacefn makes.
