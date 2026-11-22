---
icon: building-factory-2
---

# Infrastructure

`configs/infra.ts` is what a deploy creates: a plain [Alchemy](https://alchemy.run) stack, scaffolded with the app and yours to change. It's exactly what `alchemy deploy` would run, so Alchemy's docs cover everything in it. spacefn adds two things.

## `#space/infra.ts`

Generated from `app/` like the manifest, it holds what the file conventions ask for, as plain data:

| Field                | From                                       |
| -------------------- | ------------------------------------------ |
| `app.name`           | `package.json`'s `name`                    |
| `app.databases`      | `app/db/*/`, with their driver and binding |
| `app.queues`         | `app/queues/*.ts`                          |
| `app.crons`          | the schedules in `app/crons/*.ts`          |
| `app.durableObjects` | `app/durable-objects/*.ts`                 |
| `app.workflows`      | `app/workflows/*.ts`                       |
| `app.folders`        | the app's code folders, for rebuilds       |

The stack loops over these lists, so a new database folder or queue file gets its resource on the next deploy. It imports no app code.

## `variables(...)`

From `spacefn/infra`, it reads values from the environment for the deploy to pass on:

```ts [configs/infra.ts]
import { variables } from "spacefn/infra";

import env from "#configs/env.ts";

const bindings = {
	...variables(env), // configs/env.ts's fields; Env.secret() ones as secrets
	...variables({ OTEL_EXPORTER_OTLP_ENDPOINT: "plain", OTEL_EXPORTER_OTLP_HEADERS: "secret" }),
};
```

Secrets become Worker secrets on Cloudflare. A variable that isn't set is left out.

## Changing it

Everything else is written out: the KV namespace, the R2 bucket, the Durable Objects behind `Bus` and `RateLimiter`, the Worker or the container. Remove what you don't use and add what you need beside it, such as a domain or Workers AI:

```ts [configs/infra.ts]
const worker =
	yield *
	Cloudflare.Website.Vite("Worker", {
		// ...
		domain: "todo.example.com",
		env: { ...bindings, AI: yield * Cloudflare.Ai("AI") },
	});
```

`space doctor` names any binding the conventions need that `configs/infra.ts` doesn't give, and a Worker missing one says which when it's used.

## State

Alchemy records what each stage deployed, so the next deploy changes only what changed.

| Target     | Where the state is                                                                  |
| ---------- | ----------------------------------------------------------------------------------- |
| Cloudflare | in your account, with `Cloudflare.state()`; `space dev` uses `Alchemy.localState()` |
| Bun        | `Alchemy.localState()`, in `.alchemy/` at the app root                              |

`.alchemy/` is in `.gitignore`. Deploy a Bun stage from one machine, or move its state to a shared store.
