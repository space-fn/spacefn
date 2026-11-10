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

```ts
import { queues } from "@space/queues";

await queues.emails.send({ to: "a@example.test" });
await queues.emails.sendBatch([{ to: "b@example.test" }, { to: "c@example.test" }]);
await queues.emails.send({ to: "d@example.test" }, { delaySeconds: 30 });
```

The generated producer name is camelCase (`order-jobs.ts` becomes
`queues.orderJobs`). The payload is inferred from the consumer's type
argument; a mismatched payload fails type checking. For acknowledgment,
retry, and batch behavior, see the [queue convention](../directory-structure/queues.md)
and [scheduled digest example](../examples/scheduled-job.md).

## Configuration helpers

`queueBinding(file)` derives a producer binding name from a consumer filename.
`queueConfig(files)` returns the `cf/config` env bindings and queue triggers
implied by those files. These helpers are used by the Vite plugin; application
code normally does not call them directly.

## Related

- [Queue convention](../directory-structure/queues.md)
- [Cron API](./crons.md)
- [Webhook receiver example](../examples/webhook-receiver.md)
