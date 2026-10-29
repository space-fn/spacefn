# Queues API (`spacefn/queues`)

Queue consumer files conventionally live in `app/queues/`; the file name
defines the queue. See the [queues guide](../directory-structure/queues.md)
for generated bindings and Cloudflare setup.

## Define a consumer

```ts
import { defineQueue } from "spacefn/queues";

export default defineQueue<{ to: string }>(async (batch, env, ctx) => {
	for (const message of batch.messages) {
		await deliver(message.body.to);
		message.ack();
	}
});
```

`QueueHandler<Body>` receives a `QueueBatch<Body>`, `env`, and a
`QueueContext` with `waitUntil`. The batch has `queue`, `messages`, `ackAll()`,
and `retryAll(options?)`. Each `QueueMessage<Body>` has `id`, `body`,
`attempts`, `ack()`, and `retry({ delaySeconds? })`.

## Publish messages

`queueProducer<Body>(binding)` returns a `QueueProducer<Body>` with
`send(body, { delaySeconds? })` and `sendBatch(bodies, { delaySeconds? })`.
The producer resolves the binding from the current request or queue context at
call time. Prefer the generated typed producers from `@space/queues` when
possible. `QueueBodyOf<Handler>` extracts the consumer body type from a
`QueueHandler`.

## Configuration helpers

`queueBinding(file)` derives a producer binding name from a consumer filename.
`queueConfig(files)` returns the `cf/config` env bindings and queue triggers
implied by those files. These helpers are used by the Vite plugin; application
code normally does not call them directly.
