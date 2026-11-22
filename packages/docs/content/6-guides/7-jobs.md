---
icon: clock-play
---

# Queues and crons

## Queues

A file in `app/queues/` consumes the queue of its name. Its body is decoded with a schema before your handler sees it:

```ts [modules/emails/emails.ts]
import { Schema } from "effect";
import { Queue } from "spacefn";

import { Mailer } from "#lib/mailer.ts";

/** What the `emails` queue carries. */
export const Email = Schema.Struct({ to: Schema.String, subject: Schema.String });

/** Sends it later: puts it on the queue. */
export const later = (email: typeof Email.Type) => Queue.send("emails", email);

/** Sends it now: the queue's consumer. */
export const send = ({ to, subject }: typeof Email.Type) => Mailer.send(to, subject);
```

```ts [app/queues/emails.ts]
import { queue } from "spacefn";

import * as Emails from "#modules/emails/emails.ts";

export default queue({ body: Emails.Email, handler: Emails.send, retryDelay: "30 seconds" });
```

Send to it from anywhere with `Emails.later({ to, subject })`, which calls `Queue.send("emails", ...)`. The handler also gets the message as a second argument, `(body, message)`.

- Each message is acknowledged once its handler succeeds and retried when it fails, so one bad message doesn't redeliver the batch. A body that doesn't decode is retried too.
- After 3 retries a message is dropped; on Bun with an error in the log, on Cloudflare as the consumer's `settings` in `configs/infra.ts` say (`maxRetries`, `deadLetterQueue`).
- `message.attempts` is 1 on the first delivery; `message.id` identifies it in logs.
- `concurrency` (default 1, in order) is how many messages of a batch run at once; `retryDelay` is the wait before a retry.
- Delivery is at least once, so make handlers safe to run twice.

On Cloudflare it's a Cloudflare Queue and a consumer, which `configs/infra.ts` creates for each file. On Bun the queue is a table in the state database, consumed by the queue process; a message whose process died is delivered again about a minute later.

## Crons

A file in `app/crons/` runs a job on a schedule:

```ts [app/crons/nightly.ts]
import { cron } from "spacefn";

import * as Sessions from "#modules/accounts/sessions.ts";

export default cron("0 3 * * *", Sessions.deleteExpired);
```

The schedule is five fields in UTC: minute, hour, day of month, month, day of week. Lists (`1,15`), ranges (`9-17`), steps (`*/5`) and names (`MON-FRI`, `JAN`) work; when both day fields are set, a day matching either runs the job, as in cron.

Write the schedule as a string literal: the infra reads it from the file without running it. Jobs on the same schedule run at once, and one failing doesn't stop the others; a failure is logged.

On Cloudflare these are Cron Triggers on the Worker. On Bun the cron process runs them at the start of each matching minute; run only one cron process, or each job runs once per process.
