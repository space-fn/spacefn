# Durable Objects

`app/durable-objects/` holds one Durable Object class per file. Each class is exported, bound, and added to the config automatically.

## Layout

```txt
app/durable-objects/
└── counter.ts
```

## A Durable Object

```ts
// app/durable-objects/counter.ts
import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject {
	increment(by = 1): number {
		const value = (this.ctx.storage.kv.get<number>("value") ?? 0) + by;
		this.ctx.storage.kv.put("value", value);
		return value;
	}
}
```

- The class name becomes the binding name in camelCase form.
- Files starting with `_` are ignored.
- Migrations for a Durable Object's storage use `durableObjectExecutor`. See [tenancy](../guides/tenancy.md) for a multi-tenant Durable Object pattern.
