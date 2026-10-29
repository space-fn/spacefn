# Generated code (`.space/`)

Spacefn generates `.space/` from your folders. You import from it; never edit it.

| Generated file              | Import                  | What it gives you                                               |
| --------------------------- | ----------------------- | --------------------------------------------------------------- |
| `worker.ts`                 | `@space/worker`         | `createApp`, `registerRoutes`, and `mountApp`                   |
| `routes.ts`                 | Used by `@space/worker` | Registers discovered routes and pages in path-specificity order |
| `exports.ts`                | `@space/exports`        | Durable Object and Workflow classes for the Worker entrypoint   |
| `client.ts`                 | `@space/client`         | `script`, `styles`, `clientUrl`, and the `ClientEntry` type     |
| `queues.ts`                 | `@space/queues`         | Typed queue producer objects                                    |
| `db/<name>.ts`              | `@space/db/<name>`      | Typed query functions and migration helpers                     |
| `env.d.ts`, `bindings.d.ts` | Included by TypeScript  | Types for `spacefn/env` and Cloudflare bindings                 |

The template ignores `.space/` and regenerates it when the Vite config loads for
dev or build. Use `space gen` to create it without starting Vite. Never edit
generated files; edit the source files under `app/` instead. See [How it works](../concepts/how-it-works.md) for the Worker entrypoint example.

## Regenerate programmatically

The public `spacefn/sync` subpath exposes `sync(root, mode)`. It returns
`true` if at least one generated file changed:

```ts
import { sync } from "spacefn/sync";

const changed = await sync(process.cwd(), "dev");
```

The mode is `"dev"` or `"prod"` and controls environment-suffixed route
discovery. Most apps should use `space gen` or the Vite plugin instead.
