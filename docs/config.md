# Configuration

Everything you configure is in `configs/`, plus `app/env.ts` for the variables the app reads.

## `configs/space.ts`

```ts
import { defineSpace } from "spacefn/config";

export default defineSpace({
	target: "cloudflare", // or "bun"
	name: "todo", // default: package.json `name`; names the Worker, the container and the deploy
	aliases: { "@lib": "lib", "@ui": "src/ui" }, // import aliases, alias → folder
	db: { main: "d1", rooms: "durable-object" }, // a driver per app/db/ folder
});
```

The default aliases are `@lib`, `@modules` and `@utils`. `@space` is reserved for generated code. Default drivers are `d1` on Cloudflare and `libsql` on Bun; see [Database](database.md).

## `app/env.ts`

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

Deploys import `app/env.ts` to know which variables to pass on, so import only `spacefn` and `effect` there.

## `.env` files

| File           | Read by                                              |
| -------------- | ---------------------------------------------------- |
| `.env`         | `space dev` and `space db`                           |
| `.env.<stage>` | `space deploy --stage <stage>` (default `.env.prod`) |

A deploy never reads `.env`, so local values can't reach production. Variables already in the environment, as CI sets them, are passed on too. A deploy passes the fields of `app/env.ts` (secrets as Worker secrets on Cloudflare), the `DB_<NAME>_URL` and `_AUTH_TOKEN` of libSQL databases, and `OTEL_*`. Commit `.env.example`, never `.env`.

## `configs/vite.config.ts` (optional)

Your own Vite plugins and options, merged with spacefn's. For Tailwind:

```ts
import tailwind from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [tailwind()] });
```

## `configs/infra.ts` (optional)

What spacefn can't guess about your infrastructure:

```ts
import { defineInfra } from "@spacefn/infra";

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
