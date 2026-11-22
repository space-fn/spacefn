---
title: entry.ts
icon: file-type-ts
---

# app/entry.ts

The app itself: which services run, what wraps every request, extra routes beside the files, and how a failure is answered. Every app has one, and it's yours to change. spacefn never adds a service or a middleware you didn't list here, and the same file runs on Cloudflare and on Bun.

```ts [app/entry.ts]
import { app, databases, errorPage, staticFiles, telemetry } from "spacefn";
import { platform } from "spacefn/platform";

import Env from "#configs/env.ts";
import { Mailer } from "#lib/mailer.ts";
import { manifest } from "#space/manifest.ts";

export default app(manifest, {
	services: [
		platform(manifest),
		Env.layer,
		databases(manifest),
		telemetry(manifest.name),
		Mailer.layer,
	],
	before: [staticFiles()],
	routes: [],
	onError: errorPage,
});
```

| Option       | What it holds                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `services`   | Layers, in order: each can use the ones before it, and every page, route, queue and cron uses them |
| `before`     | Middleware around every request, outside `app/routes/_middleware.ts`                               |
| `routes`     | Effect `HttpRouter` layers beside the file routes, such as an `HttpApi`                            |
| `onError`    | What a failed request answers, from its `Cause`                                                    |
| `bun`        | Bun-only settings: `port`, `hostname`, `idleTimeout`                                               |
| `cloudflare` | Cloudflare-only settings: extra Worker `handlers`, such as `email`                                 |

`manifest` is what `space gen` found in `app/`, as a plain object: the routes, middleware, queues, crons and databases. The entry can filter it or add to it before passing it on.

Keep the entry to this list. A service of your own is written in `lib/` or its feature's folder and only listed here.

> [!TIP]
> Leave a piece out and it's gone: without `telemetry(...)` nothing is exported, and without `databases(manifest)` no database connects.

Read more in [The entry](../../6-guides/1-entry.md).
