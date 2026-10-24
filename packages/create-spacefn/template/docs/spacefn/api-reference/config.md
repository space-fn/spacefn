# Config

## `cloudflare.config.ts`

The root `cloudflare.config.ts` is the single place you declare the Worker and its bindings. It defaults to `defineSpace()` from `spacefn/cloudflare`:

```ts
import { defineSpace, compatibilityDate } from "spacefn/cloudflare";

export default defineSpace({
	name: "my-app",
	compatibilityDate: compatibilityDate(new Date("2026-10-19")),
});
```

`defineSpace(worker)` signature:

```ts
function defineSpace(worker: SpaceWorkerConfig): CloudflareConfig & { worker: WorkerConfig };
```

- `SpaceWorkerConfig` is the Cloudflare v2 `WorkerConfig` (from `cf` / `@cloudflare/config`) with `entrypoint` made optional. Spacefn fills `entrypoint` with `./app/entry.ts` (the generated Worker entry) unless you override it.
- Types come from the Cloudflare v2 config schema, the same one that replaces `wrangler.jsonc`.
- `compatibilityDate()` returns today's date by default. Prefer a pinned date literal so builds stay reproducible against runtimes that may not know a newer date yet.

Re-exported builders from `cf/config` (use them to declare bindings, exports, and triggers):

```ts
import { defineSpace, bindings, exports, triggers } from "spacefn/cloudflare";

export default defineSpace({
	name: "my-app",
	compatibilityDate: "2026-10-19",
	// worker.env, worker.exports, worker.triggers come from these builders
});
```

- `bindings` — `bindings.text`, `bindings.secret`, `bindings.durableObject`, `bindings.queue`, `bindings.kv`, and more.
- `exports` — `exports.durableObject({ storage: "sqlite" })`, `exports.workflow({ name })`.
- `triggers` — `triggers.fetch`, `triggers.queue`, `triggers.scheduled`, `triggers.email`, `triggers.connect`.

Environment bindings are also derived automatically from `app/env.ts` (fields with a default become text bindings; the rest become secrets). See [env](./env.md).

See [cloudflare-v2](../guides/cloudflare-v2.md) for the full guide.

## `SpaceOptions` (Vite plugin)

Pass options to the `space()` plugin in `vite.config.ts`. This is a different thing from `defineSpace` — it configures the Vite build, not the Worker:

```ts
import { space } from "spacefn/vite";

export default defineConfig({
	plugins: [space({ client: { plugins: [/* ... */] } })],
});
```

- `client` — Vite config fragment merged into the `app/client/` bundle build (plugins, CSS tooling, etc.).
- `cloudflare` — passed through to the Cloudflare Vite plugin.

See [client](../directory-structure/client.md) for bundling details.
