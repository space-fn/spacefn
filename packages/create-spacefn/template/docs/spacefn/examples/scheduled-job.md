# Scheduled digest

This example fans out daily work from a cron to a queue. The cron stays short;
each email can be retried independently by the queue consumer.

The cron and the consumer are setup. Who gets a digest and what it says live
in `modules/digest/`; sending mail lives in a `lib/` client.

## The email client

```ts
// lib/email.ts

export interface Email {
	to: string;
	subject: string;
	body: string;
}

export function createEmailClient(options: { apiKey: string; fetch?: typeof fetch }) {
	const send = options.fetch ?? fetch;
	return {
		async send(email: Email) {
			const response = await send("https://api.mail.example/send", {
				method: "POST",
				headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
				body: JSON.stringify(email),
			});
			if (!response.ok) throw new Error(`Email failed with ${response.status}`);
		},
	};
}
```

Replace the URL and body with your provider's API. The client takes its key as
an argument, so a test can pass a fake `fetch`.

## Build the digest

```ts
// modules/digest/index.ts

import type { Email } from "@lib/email";
import { listSubscribers, recentPosts } from "@space/db/main_db";
import type { DbReader } from "spacefn/db";

export async function digestEmails(db: DbReader, since: number): Promise<Email[]> {
	const posts = await recentPosts(db, { since });
	if (posts.length === 0) return []; // nothing new: send nothing
	const body = posts.map((post) => `- ${post.title}`).join("\n");
	const subscribers = await listSubscribers(db, {});
	return subscribers.map((subscriber) => ({
		to: subscriber.email,
		subject: "Your daily digest",
		body,
	}));
}
```

`listSubscribers` and `recentPosts` are generated queries. Skipping the digest
on a quiet day is a rule, so it is here rather than in the cron.

## Define a queue

```ts
// app/queues/emails.ts

import { createEmailClient, type Email } from "@lib/email";
import { defineQueue } from "spacefn/queues";

export default defineQueue<Email>(async (batch, env) => {
	const mail = createEmailClient({ apiKey: (env as { MAIL_API_KEY: string }).MAIL_API_KEY });
	for (const message of batch.messages) {
		try {
			await mail.send(message.body);
			message.ack();
		} catch (error) {
			console.error("email delivery failed", message.id, error);
			message.retry({ delaySeconds: 60 });
		}
	}
});
```

Do not acknowledge a message until its work has succeeded; otherwise a
temporary failure loses it.

## Schedule the work

```ts
// app/crons/daily-digest.ts

import { mainDb } from "@app/db/main_db";
import { digestEmails } from "@modules/digest";
import { queues } from "@space/queues";
import { defineCron } from "spacefn/crons";

const DAY_MS = 24 * 60 * 60 * 1000;

export default defineCron("0 8 * * *", async (event, env) => {
	const db = await mainDb((env as { DB: D1Database }).DB);
	const emails = await digestEmails(db, event.scheduledTime - DAY_MS);
	for (let i = 0; i < emails.length; i += 100) {
		await queues.emails.sendBatch(emails.slice(i, i + 100));
	}
});
```

The cron passes `scheduledTime` instead of letting the module read the clock,
so a test can choose the day. The loop limits each send to 100 messages;
choose a batch size appropriate for your queue limits and workload. The
queue's body type is inferred from its consumer, so invalid jobs fail type
checking.

## Schedule a simple cleanup

A cron can also call a small bounded task directly:

```ts
// app/crons/nightly.ts

import { mainDb } from "@app/db/main_db";
import { deleteExpiredSessions } from "@modules/sessions";
import { defineCron } from "spacefn/crons";

export default defineCron("0 3 * * *", async (event, env) => {
	await deleteExpiredSessions(await mainDb((env as { DB: D1Database }).DB), event.scheduledTime);
});
```

Keep large fan-out work in a queue rather than keeping one scheduled
invocation busy.

## What runs

- `0 8 * * *` runs every day at 08:00 UTC.
- The cron asks the module for the day's emails and sends them as typed queue jobs.
- Each message is acknowledged only after the email client succeeds. A thrown
  error or explicit retry asks Cloudflare to deliver it again.
- Jobs sharing a schedule run under the same scheduled trigger, each in its
  own `cron.run` span.

See [modules](../directory-structure/modules.md), [crons](../directory-structure/crons.md),
[queues](../directory-structure/queues.md), and [tracing](../guides/tracing.md).
