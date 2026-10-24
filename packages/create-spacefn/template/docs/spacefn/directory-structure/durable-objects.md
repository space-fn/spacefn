# Durable Objects

A file in `app/durable-objects/` exports a class. spacefn wires it into the config, types the binding, exports it from the Worker, and traces calls to it. The class itself is plain Cloudflare (`extends DurableObject` from `cloudflare:workers`); there is no `defineDurableObject`.

## Layout

```txt
app/durable-objects/
└── counter.ts
```

Files starting with `_` are ignored. One class per file. The binding name is `DO_` plus the uppercased snake-case of the class name, for example `ChatRoom` becomes `DO_CHAT_ROOM`.

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

Call it from a route:

```ts
// app/routes/counter.ts
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const ns = c.env.DO_COUNTER;
	return { value: await ns.getByName("main").increment() };
});
```

`c.env.DO_COUNTER` is typed as `DurableObjectNamespace<Counter>`, so `getByName` and `get` return a typed RPC stub. Every `get`/`getByName` call is traced as a `do.call` span.

## Multi-tenancy: a Durable Object per tenant

This is the main real use case. Each tenant gets its own Durable Object with its own SQLite database, so tenant rows never enter the shared database.

```ts
import { migrate } from "@space/db/tenant_db";
// app/durable-objects/tenant.ts
import { DurableObject } from "cloudflare:workers";
import { durableObjectExecutor } from "spacefn/db";

export class Tenant extends DurableObject {
	private ready?: Promise<unknown>;

	private migrated() {
		// run once per instance, before anything touches the schema
		this.ready ??= migrate(durableObjectExecutor(this.ctx.storage));
		return this.ready;
	}

	async listTodos(filter: unknown) {
		await this.migrated();
		return this.ctx.storage.sql.exec("SELECT id, title, done FROM todos", []).toArray();
	}
}
```

Wire it through the tenant resolver (see [tenancy](../guides/tenancy.md)):

```ts
// app/routes/t/todos.ts
import { defineHandler } from "spacefn/handler";
import { currentTenant } from "spacefn/tenancy";

export const GET = defineHandler(async (c) => {
	const tenant = currentTenant(c);
	return c.env.TENANT.getByName(tenant.internalId).listTodos({});
});
```

Two things to get right:

- The Durable Object name is the tenant's `internalId`, never the slug. The slug can change; the internal id must not.
- Run migrations inside the Durable Object before it serves, so a request never sees a half-migrated database. The generated `migrated()` helper is D1-only, so for Durable Object storage use the generated `migrate` with `durableObjectExecutor`. Each tenant Durable Object has its own `space_migrations` ledger, so `applyMigrations` is idempotent per tenant.

## WebSockets

spacefn does not wrap WebSockets. A Durable Object that holds connections is standard Cloudflare: implement `fetch` to upgrade, and `webSocketMessage` / `webSocketClose` to handle traffic. spacefn's job ends at wiring the binding and typing it.

```ts
// app/durable-objects/room.ts
import { DurableObject } from "cloudflare:workers";

export class Room extends DurableObject {
	async fetch(request: Request) {
		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1]);
		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		for (const client of this.ctx.getWebSockets()) {
			if (client !== ws) client.send(message);
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		ws.close(code, reason);
	}
}
```

Reach it from a route the same way:

```ts
// app/routes/room/[id].ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(async (c) => {
	const id = c.req.param("id");
	const ns = c.env.ROOM;
	const stub = ns.getByName(id);
	return stub.fetch(c.req.raw);
});
```

## Server-Sent Events

Same idea: the Durable Object owns the connection and pushes events. spacefn only provides the typed binding.

```ts
// app/durable-objects/feed.ts
import { DurableObject } from "cloudflare:workers";

export class Feed extends DurableObject {
	private clients = new Set<WritableStreamDefaultWriter<Uint8Array>>();

	async fetch() {
		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
		const writer = writable.getWriter();
		this.clients.add(writer);
		writer.closed.finally(() => this.clients.delete(writer));
		return new Response(readable, {
			headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
		});
	}

	broadcast(event: string, data: string) {
		const chunk = new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`);
		for (const writer of this.clients) writer.write(chunk).catch(() => this.clients.delete(writer));
	}
}
```

## How the binding is wired

You never declare a Durable Object in `cloudflare.config.ts` by hand. The `space()` Vite plugin's `config` callback scans `app/durable-objects/` and calls `durableObjectsConfig(files, worker.name)`, which adds two entries to the Worker config:

The generated config looks like this:

```ts
// added by the space() Vite plugin, not by you
exports: {
	Counter: exports.durableObject({ storage: "sqlite" }),
},
env: {
	DO_COUNTER: bindings.durableObject({ worker: worker.name, exportName: "Counter" }),
},
```

`worker.name` comes from your `cloudflare.config.ts` (`defineConfig({ worker: { name: "..." } })`). The class itself reaches Cloudflare through `app/entry.ts`, which re-exports it via `export * from "@space/exports"` (`.space/exports.ts` is generated). Remove that re-export and the binding points at a class the Worker no longer exports.

If you need a Durable Object that the convention does not cover (renamed, transferred, or deleted lifecycle states), declare it directly with `bindings.durableObject` / `exports.durableObject` in `cloudflare.config.ts`.

## Notes

- Durable Objects here are always SQLite-backed (`storage: "sqlite"`). There is no KV-only variant in the convention.
- `unwrapDurableObject` unwraps the dev-mode proxy Cloudflare puts around a binding. You rarely need it.
- Exports and bindings are generated; do not edit `.space/exports.ts` or `.space/bindings.d.ts` by hand.
