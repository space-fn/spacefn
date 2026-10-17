# Environment

`env.ts` at the project root declares what the app reads. Spacefn checks it on every request, types it, and declares the matching Cloudflare bindings.

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

The `space()` Vite plugin declares one binding per field:

| Field                             | Binding                       |
| --------------------------------- | ----------------------------- |
| Has a default and is not a secret | Text binding with the default |
| Anything else                     | Secret binding                |

Local values go in `.dev.vars`. For deploys, pass `--secrets-file`:

```sh
cf deploy --secrets-file .dev.vars
```

Bindings you write in `cloudflare.config.ts` win over derived ones. Do not import `env.ts` from that file. See [cloudflare-v2.md](cloudflare-v2.md).

Editing `env.ts` restarts the dev server.

## Generated files

| File               | Purpose                              |
| ------------------ | ------------------------------------ |
| `.space/worker.ts` | Applies the validation before routes |
| `.space/env.d.ts`  | Gives `env` the types of `env.ts`    |

Include `.space/**/*` in `tsconfig.json`.
