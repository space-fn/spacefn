# Environment

`app/env.ts` is the runtime validation schema. It tells Spacefn which values the app expects, what types they must be, and which ones are required. It is not the source-of-truth declaration for the Cloudflare Worker binding itself. The actual environment entries belong in `cloudflare.config.ts` under `worker.env`, which is the supported Cloudflare beta config shape. A root-level `env.ts` is ignored; `space doctor` flags it.

```ts
import { defineConfig, bindings } from "cf/config";

export default defineConfig({
	worker: {
		entrypoint: "./app/entry.ts",
		name: "my-app",
		compatibilityDate: "2026-10-19",
		env: {
			GREETING: bindings.text("hello"),
			MAX_ITEMS: bindings.text("10"),
			VERBOSE: bindings.text("false"),
			API_KEY: bindings.secret(),
			WEBHOOK_URL: bindings.secret(),
		},
	},
});
```

Then declare the validation schema the app reads at request time:

```ts
import { boolean, defineEnv, number, secret, string } from "spacefn/env";

export default defineEnv({
	GREETING: string({ default: "hello" }),
	MAX_ITEMS: number({ default: 10 }),
	VERBOSE: boolean({ default: false }),
	API_KEY: secret(),
	WEBHOOK_URL: secret({ optional: true }),
});
```

Read it anywhere a request is being handled:

```ts
import { env } from "spacefn/env";

env.MAX_ITEMS; // number
env.WEBHOOK_URL; // string | undefined
```

## Fields

| Builder     | Value     | Notes                                                |
| ----------- | --------- | ---------------------------------------------------- |
| `string()`  | `string`  |                                                      |
| `number()`  | `number`  | Parsed from text. `NaN` and empty text are rejected. |
| `boolean()` | `boolean` | `true`, `false`, `1` or `0`, any case.               |
| `secret()`  | `string`  | No default. Never printed in errors.                 |

Every builder except `secret()` takes `default`. All take `optional: true`, which makes the type `T | undefined`.

## Validation

- The first request parses the environment. The result is cached for that env object.
- A bad value fails the request with a 500. The log lists every problem at once, for example `API_KEY is required` and `MAX_ITEMS must be a number, got "many"`.
- Secret values are never part of an error message.
- Reading `env` outside a request throws.

## Bindings

`env.ts` validates the values the app reads; `cloudflare.config.ts` declares the actual Worker env entries. In other words, `worker.env.API_KEY` / `worker.env.GREETING` is the real Cloudflare binding definition, and `env.ts` is the validation layer on top of it.

This matters most for secrets: define the binding in `worker.env`, then add the secret value in Cloudflare for production. `app/env.ts` does not replace the secret configuration step.

Local development still works with `.dev.vars` for values you want to keep out of source control. For deploys, pass `--secrets-file`:

```sh
cf deploy --secrets-file .dev.vars
```

Bindings you write in `cloudflare.config.ts` win over any derived ones. Do not import `env.ts` from that file. See [Cloudflare setup](../guides/cloudflare-v2.md).

Editing `env.ts` restarts the dev server.

## Generated files

| File               | Purpose                              |
| ------------------ | ------------------------------------ |
| `.space/worker.ts` | Applies the validation before routes |
| `.space/env.d.ts`  | Gives `env` the types of `env.ts`    |

Include `.space/**/*` in `tsconfig.json`.
