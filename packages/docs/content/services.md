# Services

spacefn gives every app five services. Get one with `yield*` and use it the same way on every target; what backs it depends on where the app runs.

| Service       | What it's for                           | Cloudflare                 | Bun                             |
| ------------- | --------------------------------------- | -------------------------- | ------------------------------- |
| `Kv`          | strings by key, with an optional expiry | Workers KV                 | the state database              |
| `Blob`        | files and uploads                       | R2                         | a folder, `.space/data/blob`    |
| `Queue`       | background jobs                         | Cloudflare Queues          | the state database              |
| `Bus`         | change notices to live pages            | a Durable Object per topic | the state database, plus memory |
| `RateLimiter` | counting hits per key                   | a Durable Object per key   | the state database              |

On Cloudflare, `configs/infra.ts` creates the KV namespace and the R2 bucket behind `Kv` and `Blob` (R2 must be enabled on the account); remove the one the app doesn't use.

On Bun, the web server, the queue consumers and the crons run in separate processes, so these services keep their data in a shared libSQL **state database**: `.space/data/state.db` locally, or `SPACE_STATE_URL` (and `SPACE_STATE_AUTH_TOKEN`) for a remote one. See [Deploying](deploy.md).

## Kv

```ts
const kv = yield * Kv;
yield * kv.set("greeting", "hi", { ttl: "10 minutes" });
const greeting = yield * kv.get("greeting"); // Option<string>
yield * kv.delete("greeting");
```

Workers KV is eventually consistent and keeps a value for at least 60 seconds, so shorter TTLs are raised to 60 there. Don't use it for counters; that's what `RateLimiter` is for.

## Blob

```ts
const blob = yield * Blob;
// An `Upload` from Input.body is a File.
const bytes = new Uint8Array(yield * Effect.promise(() => upload.arrayBuffer()));
yield * blob.put(`avatars/${userId}.png`, bytes, { contentType: upload.type });
const avatar = yield * blob.get(`avatars/${userId}.png`); // Option<{ body, size, contentType, uploadedAt }>
const keys = yield * blob.list({ prefix: "avatars/", limit: 100 });
yield * blob.delete(`avatars/${userId}.png`);
```

## Queue

```ts
yield * (yield * Queue).send("emails", { to: "ada@example.com" }, { delay: "5 minutes" });
```

The queue is named after its consumer file, `app/queues/emails.ts`; sending to a queue without one is an error. Bodies must survive structured cloning. See [Queues and crons](jobs.md).

## Bus

```ts
yield * (yield * Bus).publish("todos", "changed");
```

Every subscriber to the topic gets the message; nothing is stored, so only those subscribed right now see it. Pages subscribe through `Datastar.watch` (see [Pages](pages.md)). On Bun, subscribers in the same process get it at once and those in other processes within about a quarter of a second.

## RateLimiter

Use it through `rateLimit`, which fails with `TooManyRequests` (a 429 with `Retry-After`) past the limit:

```ts
yield * rateLimit(`sign-in:${email}`, { limit: 5, window: "15 minutes" });
yield * rateLimit(`sign-in:${yield * clientAddress}`, { limit: 20, window: "15 minutes" });
```

Counts are fixed windows, and every process and instance agrees on them. `clientAddress` is Cloudflare's `cf-connecting-ip`, else the connection's address; trust it only behind a proxy that sets or strips that header.

## Your own services

List your own layers in the entry's `services`, after spacefn's. They can use the env, the databases and the services above, and everything in the app can use them:

```ts [app/entry.ts]
import { Mailer } from "#lib/mailer.ts";

export default app(manifest, {
	services: [
		platform(manifest),
		Env.layer,
		databases(manifest),
		telemetry(manifest.name),
		Mailer.layer,
	],
});
```

See [The entry](entry.md).

On Cloudflare, `CloudflareEnv` from `spacefn/cloudflare` gives bindings spacefn doesn't wrap, such as your Durable Objects (`DO_CHAT_ROOM` for `app/durable-objects/chat-room.ts`) or ones you add in `configs/infra.ts`.
