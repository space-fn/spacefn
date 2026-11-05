# Queues

`app/queues/` holds one queue and its consumer per file. The file name is the queue name.

## Layout

```txt
app/queues/
├── emails.ts
└── order-jobs.ts   → queues.orderJobs
```

## A queue

```ts
// app/queues/emails.ts
import { defineQueue } from "spacefn/queues";

export default defineQueue<{ to: string; subject: string }>(async (batch) => {
	for (const message of batch.messages) {
		await sendMail(message.body.to, message.body.subject);
		message.ack();
	}
});
```

The consumer and its trigger are generated from the file. The type argument is the message body, and the typed producer in `.space/queues.ts` uses it.

## Send messages

Send from any route, page action, or cron:

```ts
// app/routes/signup.ts
import { queues } from "@space/queues";
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const { email } = await c.req.json<{ email: string }>();
	await queues.emails.send({ to: email, subject: "Welcome" });
	return c.json({ queued: true }, 202);
});
```

| Call                                               | Effect                                 |
| -------------------------------------------------- | -------------------------------------- |
| `queues.emails.send(body)`                         | One message                            |
| `queues.emails.send(body, { delaySeconds })`       | One message, delivered after a delay   |
| `queues.emails.sendBatch([a, b, c])`               | Many messages in one call              |
| `queues.emails.sendBatch([...], { delaySeconds })` | Many messages, delivered after a delay |

```ts
await queues.emails.send({ to: "a@example.com", subject: "Reminder" }, { delaySeconds: 600 });
await queues.emails.sendBatch([{ to: "b@example.com", subject: "Hi" }]);
```

Each queue name maps to a camelCase producer: `order-jobs.ts` is `queues.orderJobs`. Bodies are type-checked against the consumer's type argument, so `queues.emails.send({ to: 1 })` is a compile error.

## Acknowledge, retry, and give up

A message is acknowledged only when your handler calls `message.ack()` (or `batch.ackAll()`). Decide per message what should happen:

```ts
// app/queues/order-jobs.ts
import { defineQueue } from "spacefn/queues";

export default defineQueue<{ orderId: string }>(async (batch) => {
	for (const message of batch.messages) {
		try {
			await fulfil(message.body.orderId);
			message.ack();
		} catch (error) {
			if (message.attempts >= 5) {
				console.error("giving up on", message.body.orderId, error);
				message.ack(); // stop retrying
			} else {
				message.retry({ delaySeconds: 2 ** message.attempts * 10 }); // 20s, 40s, 80s...
			}
		}
	}
});
```

| Method                     | Use                                                |
| -------------------------- | -------------------------------------------------- |
| `message.ack()`            | Done with this message                             |
| `message.retry(options?)`  | Redeliver this message, optionally after a delay   |
| `message.attempts`         | How many times it has been delivered (starts at 1) |
| `batch.ackAll()`           | Done with every message in the batch               |
| `batch.retryAll(options?)` | Redeliver the whole batch                          |

If the handler throws, the platform can retry the batch; use `message.retry()` when you need to request a retry explicitly.

## Work in the background

The consumer's third argument is a context with `waitUntil`:

```ts
export default defineQueue<{ url: string }>(async (batch, env, ctx) => {
	for (const message of batch.messages) {
		ctx.waitUntil(recordAudit(env, message.body.url));
		message.ack();
	}
});
```

## Tracing and failures

- A send inside a request is traced. The consumer's `queue.process` span joins that request's trace.
- Each body is sent in an envelope that holds the trace context. Other Workers that read the same queue see the envelope around the body.
- A batch whose messages come from several traces is traced under the first message's trace.
- A batch for a queue with no consumer fails and is retried, so no message is lost.

## Related

- [Queues API](../api-reference/queues.md)
- [Crons](./crons.md) that fan out to a queue
- [Scheduled job example](../examples/scheduled-job.md)
