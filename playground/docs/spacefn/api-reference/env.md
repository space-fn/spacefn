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

`Field<V>` describes a schema field, `FieldOptions<T>` contains `default` and
`optional`, `Schema` is a record of fields, and `InferEnv<S>` derives the
parsed value types from a schema. `AppEnv` and `AppBindings` are augmented by
generated declarations; `Register` is the module-augmentation interface.

## Parse values directly

`parseEnv(schema, raw)` validates a plain record and returns its typed values.
It applies defaults, permits absent optional fields, converts number and
boolean strings, and throws `EnvError` with an `issues` array if any field is
invalid. `EnvError` messages do not reveal secret values. Normal requests use
`envMiddleware(schema)` from `spacefn/runtime`, which parses and binds the
request environment before handlers run.

## Reading values

```ts
import { env } from "spacefn/env";

env.MAX_ITEMS; // number
env.WEBHOOK_URL; // string | undefined
```

See [env](../directory-structure/env.md) for the folder convention.
