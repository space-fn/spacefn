# Scheduled digest

This example fans out daily work from a cron to a queue. The cron stays short;
each email can be retried independently by the queue consumer.

## Define a queue

Create `app/queues/emails.ts`:

```ts
import { sendEmail } from "@lib/email";
import { defineQueue } from "spacefn/queues";

type EmailJob = { to: string; subject: string; body: string };

export default defineQueue<EmailJob>(async (batch) => {
	for (const message of batch.messages) {
		try {
			await sendEmail(message.body);
			message.ack();
		} catch (error) {
			console.error("email delivery failed", message.id, error);
			message.retry({ delaySeconds: 60 });
		}
	}
});
```

`sendEmail` is an app-owned provider adapter. Do not acknowledge a message
until its work has succeeded; otherwise a temporary failure loses it.

## Schedule the work

Create `app/crons/daily-digest.ts`:

```ts
import { buildDigest, listSubscribers } from "@modules/subscribers";
import { queues } from "@space/queues";
import { defineCron } from "spacefn/crons";

export default defineCron("0 8 * * *", async (_event, env) => {
	const db = (env as { DB: D1Database }).DB;
	const subscribers = await listSubscribers(db);
	const jobs = await Promise.all(
		subscribers.map(async (subscriber) => ({
			to: subscriber.email,
			subject: "Your daily digest",
			body: await buildDigest(subscriber),
		})),
	);

	for (let i = 0; i < jobs.length; i += 100) {
		await queues.emails.sendBatch(jobs.slice(i, i + 100));
	}
});
```

`listSubscribers` and `buildDigest` are app-owned functions. The loop limits
each send to 100 messages; choose a batch size appropriate for your queue
limits and workload. The queue's body type is inferred from its consumer, so
invalid jobs fail type checking.

## Schedule a simple cleanup

A cron can also do a small bounded task directly:

```ts
import { deleteExpiredSessions } from "@modules/sessions";
// app/crons/nightly.ts
import { defineCron } from "spacefn/crons";

export default defineCron("0 3 * * *", async (_event, env) => {
	const db = (env as { DB: D1Database }).DB;
	await deleteExpiredSessions(db, Date.now());
});
```

The database function is app-owned. Keep large fan-out work in a queue rather
than keeping one scheduled invocation busy.

## What runs

- `0 8 * * *` runs every day at 08:00 UTC.
- The cron reads the current subscribers and sends typed queue jobs.
- Each message is acknowledged only after `sendEmail` succeeds. A thrown error
  or explicit retry asks Cloudflare to deliver it again.
- Jobs sharing a schedule run under the same scheduled trigger, each in its
  own `cron.run` span.

See [crons](../directory-structure/crons.md), [queues](../directory-structure/queues.md),
and [tracing](../guides/tracing.md).
