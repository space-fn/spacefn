---
icon: server
---

# Services

spacefn gives every app five services. Call them through their class, `yield* Kv.get(key)`, the same way on every target; what backs them depends on where the app runs. `yield* Kv` gives the whole service, to pass around.

| Service       | What it's for                           | Cloudflare                 | Bun                             |
| ------------- | --------------------------------------- | -------------------------- | ------------------------------- |
| `Kv`          | strings by key, with an optional expiry | Workers KV                 | the state database              |
| `Blob`        | files and uploads                       | R2                         | a folder, `.space/data/blob`    |
| `Queue`       | background jobs                         | Cloudflare Queues          | the state database              |
| `Bus`         | change notices to live pages            | a Durable Object per topic | the state database, plus memory |
| `RateLimiter` | counting hits per key                   | a Durable Object per key   | the state database              |

On Cloudflare, `configs/infra.ts` creates the KV namespace and the R2 bucket behind `Kv` and `Blob` (R2 must be enabled on the account); remove the one the app doesn't use.

On Bun, the web server, the queue consumers and the crons run in separate processes, so these services keep their data in a shared libSQL **state database**: `.space/data/state.db` locally, or `SPACE_STATE_URL` (and `SPACE_STATE_AUTH_TOKEN`) for a remote one. See [Deploying](../5-deployment/2-bun.md).

## Kv

```ts
yield * Kv.set("greeting", "hi", { ttl: "10 minutes" });
const greeting = yield * Kv.get("greeting"); // Option<string>
yield * Kv.delete("greeting");
```

Workers KV is eventually consistent and keeps a value for at least 60 seconds, so shorter TTLs are raised to 60 there. Don't use it for counters; that's what `RateLimiter` is for.

## Blob

```ts
// An `Upload` from Input.body is a File.
const bytes = new Uint8Array(yield * Effect.promise(() => upload.arrayBuffer()));
yield * Blob.put(`avatars/${userId}.png`, bytes, { contentType: upload.type });
const avatar = yield * Blob.get(`avatars/${userId}.png`); // Option<{ body, size, contentType, uploadedAt }>
const keys = yield * Blob.list({ prefix: "avatars/", limit: 100 });
yield * Blob.delete(`avatars/${userId}.png`);
```

## Queue

```ts
yield * Queue.send("emails", { to: "ada@example.com" }, { delay: "5 minutes" });
```

The queue is named after its consumer file, `app/queues/emails.ts`; sending to a queue without one is an error. Bodies must survive structured cloning. See [Queues and crons](7-jobs.md).

## Bus

```ts
yield * Bus.publish("todos", "changed");
```

Every subscriber to the topic gets the message; nothing is stored, so only those subscribed right now see it. Pages subscribe through `Datastar.watch` (see [Pages](3-pages.md)). On Bun, subscribers in the same process get it at once and those in other processes within about a quarter of a second.

## RateLimiter

Use it through `rateLimit`, which fails with `TooManyRequests` (a 429 with `Retry-After`) past the limit:

```ts
yield * rateLimit(`sign-in:${email}`, { limit: 5, window: "15 minutes" });
yield * rateLimit(`sign-in:${yield * clientAddress}`, { limit: 20, window: "15 minutes" });
```

Counts are fixed windows, and every process and instance agrees on them. `clientAddress` is Cloudflare's `cf-connecting-ip`, else the connection's address; trust it only behind a proxy that sets or strips that header.

## Your own services

A service of your own is an Effect `Context.Service` with a layer, in `lib/` when every feature can use it, or in its feature's `modules/` folder. Here a mailer, over the `HttpClient` that `platform(manifest)` gives:

```ts [lib/mailer.ts]
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import Env from "#configs/env.ts";

export class Mailer extends Context.Service<
	Mailer,
	{ readonly send: (to: string, subject: string) => Effect.Effect<void, unknown> }
>()("app/Mailer") {
	static readonly layer = Layer.effect(
		Mailer,
		Effect.gen(function* () {
			const env = yield* Env;
			const http = yield* HttpClient.HttpClient;
			return {
				send: (to, subject) =>
					HttpClientRequest.post("https://api.mail.example/send").pipe(
						HttpClientRequest.bearerToken(env.MAIL_TOKEN),
						HttpClientRequest.bodyJsonUnsafe({ to, subject }),
						http.execute,
						Effect.asVoid,
					),
			};
		}),
	);

	static readonly send = (to: string, subject: string) =>
		Mailer.use((mailer) => mailer.send(to, subject));
}
```

The static `send` lets code call `Mailer.send(to, subject)`, as spacefn's own services are called. In a test, provide `Layer.succeed(Mailer)({ send: ... })` instead.

List the layer in the entry's `services`, after spacefn's. It can use the env, the databases and the services above, and everything in the app can use it:

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

See [The entry](1-entry.md).

On Cloudflare, `CloudflareEnv` from `spacefn/cloudflare` gives bindings spacefn doesn't wrap, such as your Durable Objects (`DO_CHAT_ROOM` for `app/durable-objects/chat-room.ts`) or ones you add in `configs/infra.ts`.
