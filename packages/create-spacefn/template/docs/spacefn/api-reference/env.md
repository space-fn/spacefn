# Environment

## `defineEnv`

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

## Builders

| Builder     | Value     | Notes                                                |
| ----------- | --------- | ---------------------------------------------------- |
| `string()`  | `string`  |                                                      |
| `number()`  | `number`  | Parsed from text. `NaN` and empty text are rejected. |
| `boolean()` | `boolean` | `true`, `false`, `1` or `0`, any case.               |
| `secret()`  | `string`  | No default. Never printed in errors.                 |

Every builder except `secret()` takes `default`. All take `optional: true`, which makes the type `T | undefined`.

## Reading values

```ts
import { env } from "spacefn/env";

env.MAX_ITEMS; // number
env.WEBHOOK_URL; // string | undefined
```

See [env](../directory-structure/env.md) for the folder convention.
