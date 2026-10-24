# Config

## `cloudflare.config.ts`

The root `cloudflare.config.ts` declares the Worker and its bindings. It is a plain Cloudflare config (from `cf` / `@cloudflare/config`); spacefn no longer wraps it. Spacefn reads `worker.name` and `worker.entrypoint` from this file and merges convention-derived bindings (queues, crons, durable objects, workflows) on top:

```ts
import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		entrypoint: "./app/entry.ts",
		name: "my-app",
		compatibilityDate: "2026-10-19",
	},
});
```

- `entrypoint: "./app/entry.ts"` is required: it points at the generated Worker entry that mounts routes, pages, durable objects, queues and workflows. Override it only if you know what you are doing.
- `name` is the Worker name used for durable object and workflow bindings.
- `compatibilityDate` should be a pinned date literal so builds stay reproducible against runtimes that may not know a newer date yet.

Builders come directly from `cf/config` (import them from there, not from `spacefn`):

```ts
import { defineConfig, bindings, exports, triggers } from "cf/config";

export default defineConfig({
	worker: {
		entrypoint: "./app/entry.ts",
		name: "my-app",
		compatibilityDate: "2026-10-19",
		env: {
			DB: bindings.d1({ name: "my-app-db" }),
		},
		exports: {
			Counter: exports.durableObject({ storage: "sqlite" }),
		},
	},
});
```

- `bindings` — `bindings.text`, `bindings.secret`, `bindings.durableObject`, `bindings.queue`, `bindings.kv`, and more.
- `exports` — `exports.durableObject({ storage: "sqlite" })`, `exports.workflow({ name })`.
- `triggers` — `triggers.fetch`, `triggers.queue`, `triggers.scheduled`, `triggers.email`, `triggers.connect`.

Environment bindings are also derived automatically from `app/env.ts` (fields with a default become text bindings; the rest become secrets). See [env](./env.md).

See [cloudflare-v2](../guides/cloudflare-v2.md) for the full guide.

## `SpaceOptions` (Vite plugin)

Pass options to the `space()` plugin in `vite.config.ts`. This is a different thing from `defineConfig` — it configures the Vite build, not the Worker:

```ts
import { space } from "spacefn/vite";

export default defineConfig({
	plugins: [space({ client: { plugins: [/* ... */] } })],
});
```

- `client` — Vite config fragment merged into the `app/client/` bundle build (plugins, CSS tooling, etc.).
- `cloudflare` — passed through to the Cloudflare Vite plugin.

See [client](../directory-structure/client.md) for bundling details.
