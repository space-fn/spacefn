# Cloudflare setup

spacefn runs on Cloudflare Workers through the Cloudflare Vite plugin. The
scaffold supplies the Vite config and Cloudflare plugin; you declare the Worker
entrypoint and any app-owned bindings in `cloudflare.config.ts`.

## Worker config

The root `cloudflare.config.ts` must point at `app/entry.ts`:

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

Use the `cf/config` package for Cloudflare config helpers. For example, declare
a D1 binding that your routes read as `c.env.DB`:

```ts
import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		entrypoint: "./app/entry.ts",
		name: "my-app",
		compatibilityDate: "2026-10-19",
		env: {
			DB: bindings.d1({ name: "my-app-db" }),
		},
	},
});
```

The template's `space()` plugin reads `worker.name` and adds convention-backed
queues, scheduled triggers, Durable Objects, and Workflows. Do not duplicate
those generated entries. Your explicit `worker.env` entries take precedence
when a binding name overlaps. See [directory conventions](../directory-structure/)
for the file and class naming rules.

Environment fields from `app/env.ts` are also converted into Cloudflare
bindings. Do not import `app/env.ts` from `cloudflare.config.ts`; the plugin
loads it separately. Values that are not declared as bindings are not visible
to the Worker. See [Environment](../directory-structure/env.md) for local and
production secrets.

## Development and deploy

```sh
pnpm dev              # local Worker via Vite
pnpm build            # production build
pnpm exec space deploy # build, then run cf deploy
```

The scaffold pins compatible `cf` and `@cloudflare/vite-plugin` versions. You
can update those app dependencies directly when taking Cloudflare toolchain
updates. `space deploy` uses the `cf` CLI included with `spacefn`; sign in with
Cloudflare before deploying. spacefn uses `cloudflare.config.ts`, not a
generated `wrangler.jsonc`.

For `tsconfig.json`, include `.space/**/*` so TypeScript sees the generated
types. See [import aliases](../concepts/import-aliases.md) for the full
template config.
