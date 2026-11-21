# Configuration

Everything you configure is in `configs/`, including `configs/env.ts`, the variables the app reads.

The files there are the tools' own, so what you know about Vite, Vitest and TypeScript applies as is. spacefn adds a plugin, not a config format of its own.

## `configs/vite.ts`

The app's Vite config. spacefn is a plugin in it, and its `target` says where the app runs:

```ts [configs/vite.ts]
import { space } from "spacefn/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [space({ target: "cloudflare" })] }); // or "bun"
```

When Vite starts (`space dev`, `space build`, `npm test`), the plugin writes `.space/` from `app/`, then serves and builds the app for its target. Add your own plugins and options beside it, as in any Vite project. For Tailwind:

```ts [configs/vite.ts]
import tailwind from "@tailwindcss/vite";
import { space } from "spacefn/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [space({ target: "cloudflare" }), tailwind()] });
```

`configs/vitest.ts` merges it, so tests run with the same plugins. The app's name, for the Worker, the container and the deploy, is `package.json`'s `name`.

Imports such as `#lib/...` are declared in `package.json`; see [Conventions](conventions.md#imports). Each database's driver is in its own `app/db/<name>/config.json`; see [Database](database.md#configjson).

## `configs/env.ts`

The variables the app reads, checked when it starts:

```ts
import { defineEnv, Env } from "spacefn";

export default defineEnv({
	GREETING: Env.string({ default: "Hello" }),
	MAX_TODOS: Env.int({ default: 100 }),
	DEBUG: Env.boolean({ optional: true }),
	SITE_URL: Env.url(),
	STRIPE_KEY: Env.secret(),
});
```

Read it as a service: `const env = yield* Env` (the default export) gives typed values. A secret is `Redacted`, so it never shows up in logs; `Redacted.value(env.STRIPE_KEY)` reads it. `Env.schema(schema)` takes any Effect Schema that decodes from a string. A missing or invalid variable stops the app at start with an error naming it.

Deploys import `configs/env.ts` to know which variables to pass on, so import only `spacefn` and `effect` there.

## `.env` files

| File           | Read by                                              |
| -------------- | ---------------------------------------------------- |
| `.env`         | `space dev` and `space db`                           |
| `.env.<stage>` | `space deploy --stage <stage>` (default `.env.prod`) |

A deploy never reads `.env`, so local values can't reach production. Variables already in the environment, as CI sets them, are passed on too. A deploy passes the fields of `configs/env.ts` (secrets as Worker secrets on Cloudflare), the `DB_<NAME>_URL` and `_AUTH_TOKEN` of libSQL databases, and `OTEL_*`. Commit `.env.example`, never `.env`.

## `configs/infra.ts` (optional)

What spacefn can't guess about your infrastructure:

```ts
import { defineInfra } from "spacefn/infra";

export default defineInfra({
	cloudflare: {
		// Worker settings spacefn leaves alone: domain, routes, observability, limits...
		worker: { domain: "todo.example.com" },
		// Bindings spacefn doesn't make, read with CloudflareEnv.
		// bindings: Effect.gen(function* () { return { AI: yield* Cloudflare.Ai("AI") }; }),
	},
	docker: {
		host: "ssh://deploy@server.example.com", // default: local Docker
		port: 8080, // default 3000
		env: { TZ: "UTC" },
	},
});
```
