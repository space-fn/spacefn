---
title: configs/
icon: settings
---

# configs/

The tools' settings, kept out of the app root. Each file is the tool's own format, so what you know about Vite, Vitest and TypeScript applies as is.

```txt
configs/
├── env.ts                     the variables the app reads, checked at start
├── vite.ts                    Vite, with spacefn's plugin and the target
├── vitest.ts                  Vitest, merging vite.ts
├── tsconfig.json              TypeScript; the root tsconfig.json extends it
├── infra.ts                   what a deploy creates: a plain Alchemy stack
├── Dockerfile                 the image a Bun deploy builds (Bun only)
└── Dockerfile.dockerignore    what stays out of that image
```

## `vite.ts`

spacefn is a plugin here, and `target` says where the app runs. Add other plugins beside it:

```ts [configs/vite.ts]
import tailwindcss from "@tailwindcss/vite";
import { space } from "spacefn/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [tailwindcss(), space({ target: "cloudflare" })] });
```

## `env.ts`

The variables the app reads, each with its type. A missing or invalid one stops the app at start, naming it:

```ts [configs/env.ts]
import { defineEnv, Env } from "spacefn";

export default defineEnv({
	SITE_URL: Env.url(),
	STRIPE_KEY: Env.secret(),
	MAX_TODOS: Env.int({ default: 100 }),
});
```

Read it in code with `const env = yield* Env` (imported from `#configs/env.ts`). Deploys import this file to know what to pass on, so import only `spacefn` and `effect` in it.

## `infra.ts`

The app's infrastructure as a plain [Alchemy](https://alchemy.run) stack: what `space deploy` creates and, on Cloudflare, what `space dev` runs locally. It loops over what `app/` asks for, from `#space/infra.ts`, and is yours to change: add a domain, remove the R2 bucket you don't use.

## `tsconfig.json` and `vitest.ts`

`include` lists `app/`, `lib/`, `modules/` and `configs/`; add a folder there if you make another. `vitest.ts` merges `vite.ts`, so tests run with the same plugins, and finds `*.test.ts` in `app/`, `modules/` and `lib/`.

Read more in [Configuration](../7-reference/1-config.md).
