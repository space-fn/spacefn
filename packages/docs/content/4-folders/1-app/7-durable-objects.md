---
title: durable-objects/
icon: cube
---

# app/durable-objects/

Your own [Durable Objects](https://developers.cloudflare.com/durable-objects/), on Cloudflare only. Each file's default export is a Durable Object class. The file name gives the class its name and the Worker its binding:

```txt
app/durable-objects/
├── chat-room.ts       class ChatRoom, binding DO_CHAT_ROOM
└── counter.ts         class Counter, binding DO_COUNTER
```

spacefn exports each class from the Worker, and the scaffolded `configs/infra.ts` binds it. Only files directly in the folder count, named in lowercase letters, digits and `-`. On Bun, a file here stops `space gen`.

```ts [app/durable-objects/counter.ts]
import { DurableObject } from "cloudflare:workers";
import { Effect, ManagedRuntime, Option } from "effect";
import { durableObjectSql } from "spacefn/cloudflare";

import CounterDb from "#space/db/counter.ts";

export default class Counter extends DurableObject {
	readonly #runtime;

	constructor(ctx: DurableObjectState, env: unknown) {
		super(ctx, env);
		// app/db/counter/ has "driver": "durable-object": each object has its own SQLite.
		this.#runtime = ManagedRuntime.make(CounterDb.layer(durableObjectSql(ctx.storage)));
	}

	override fetch() {
		return this.#runtime.runPromise(
			Effect.gen(function* () {
				yield* CounterDb.bump();
				const total = yield* CounterDb.total();
				return Response.json(Option.getOrThrow(total).n);
			}),
		);
	}
}
```

Reach it from a route through `CloudflareEnv`, which gives the Worker's bindings:

```ts [modules/counter/counter.ts]
import { Effect } from "effect";
import { CloudflareEnv } from "spacefn/cloudflare";

export const bump = (name: string) =>
	Effect.gen(function* () {
		const { DO_COUNTER } = (yield* CloudflareEnv) as { DO_COUNTER: DurableObjectNamespace };
		const stub = DO_COUNTER.get(DO_COUNTER.idFromName(name));
		return yield* Effect.promise(async () => (await stub.fetch("https://counter/")).json());
	});
```

A database with `"driver": "durable-object"` lives inside each object, opened with `durableObjectSql(ctx.storage)`; it migrates as the object starts. spacefn's own `Bus` and `RateLimiter` are Durable Objects too, which `configs/infra.ts` binds beside yours.
