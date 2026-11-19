# Queues

`app/queues/` holds one queue and its consumer per file. The file name is the queue name.

## Layout

```txt
app/queues/
├── emails.ts
└── order-jobs.ts   → queues.orderJobs
```

## A queue

A consumer is setup: it unpacks each message, hands it to your code, and acknowledges it. The work itself is a module or `lib/` function that takes its dependencies as arguments (see [modules](./modules.md)).

```ts
// app/queues/emails.ts

import { createEmailClient, type Email } from "@lib/email";
import { defineQueue } from "spacefn/queues";

export default defineQueue<Email>(async (batch, env) => {
	const mail = createEmailClient({ apiKey: (env as { MAIL_API_KEY: string }).MAIL_API_KEY });
	for (const message of batch.messages) {
		await mail.send(message.body);
		message.ack();
	}
});
```

The consumer and its trigger are generated from the file. The type argument is the message body, and the typed producer in `.space/queues.ts` uses it.

## Send messages

Send from any route, page action, or cron. The decision to send, and what the message says, belongs to a module; the `app/` file passes it the producer:

```ts
// modules/accounts/welcome.ts

import type { Email } from "@lib/email";

export async function sendWelcome(send: (email: Email) => Promise<void>, to: string) {
	await send({ to, subject: "Welcome", body: "Thanks for signing up." });
}
```

```ts
// app/routes/signup.ts

import { sendWelcome } from "@modules/accounts/welcome";
import { queues } from "@space/queues";
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const { email } = await c.req.json<{ email: string }>();
	await sendWelcome((job) => queues.emails.send(job), email);
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
await queues.emails.send(reminder, { delaySeconds: 600 });
await queues.emails.sendBatch([first, second]);
```

Each queue name maps to a camelCase producer: `order-jobs.ts` is `queues.orderJobs`. Bodies are type-checked against the consumer's type argument, so `queues.emails.send({ to: 1 })` is a compile error.

## Acknowledge, retry, and give up

A message is acknowledged only when your handler calls `message.ack()` (or `batch.ackAll()`). The retry policy is delivery setup, so it stays in the consumer; fulfilling the order is a module function:

```ts
// app/queues/order-jobs.ts

import { mainDb } from "@app/db/main_db";
import { fulfilOrder } from "@modules/orders";
import { defineQueue } from "spacefn/queues";

export default defineQueue<{ orderId: string }>(async (batch, env) => {
	const db = await mainDb((env as { DB: D1Database }).DB);
	for (const message of batch.messages) {
		try {
			await fulfilOrder(db, message.body.orderId);
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
import { mainDb } from "@app/db/main_db";
import { recordAudit } from "@modules/audit";
import { defineQueue } from "spacefn/queues";

export default defineQueue<{ url: string }>(async (batch, env, ctx) => {
	const db = await mainDb((env as { DB: D1Database }).DB);
	for (const message of batch.messages) {
		ctx.waitUntil(recordAudit(db, message.body.url));
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
