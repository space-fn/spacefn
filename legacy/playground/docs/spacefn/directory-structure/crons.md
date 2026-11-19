# Crons

`app/crons/` holds scheduled jobs. One file, one job.

## Layout

```txt
app/crons/
├── nightly.ts       → 0 3 * * *
├── hourly-digest.ts → 0 * * * *
└── _shared.ts       → ignored
```

## A cron job

A cron file is setup: it holds the schedule and calls a module with the bindings it needs. What the job does lives in `modules/` (see [modules](./modules.md)).

```ts
// app/crons/nightly.ts

import { mainDb } from "@app/db/main_db";
import { deleteExpiredSessions } from "@modules/sessions";
import { defineCron } from "spacefn/crons";

export default defineCron("0 3 * * *", async (event, env) => {
	await deleteExpiredSessions(await mainDb((env as { DB: D1Database }).DB), event.scheduledTime);
});
```

Pass the event's `scheduledTime` rather than calling `Date.now()` inside the module, so a test can choose the time.

The handler receives:

| Argument | What it is                                                                  |
| -------- | --------------------------------------------------------------------------- |
| `event`  | `{ cron, scheduledTime }`. `cron` is the schedule that fired                |
| `env`    | Your Worker bindings                                                        |
| `ctx`    | `{ waitUntil(promise) }` for work that may finish after the handler returns |

## Schedules

The schedule is a five-field cron expression: minute, hour, day of month, month, weekday. Anything else fails the build with `CRON_SCHEDULE`.

| Schedule      | Runs                     |
| ------------- | ------------------------ |
| `* * * * *`   | Every minute             |
| `*/5 * * * *` | Every 5 minutes          |
| `0 * * * *`   | Every hour, on the hour  |
| `0 3 * * *`   | Every day at 03:00 UTC   |
| `0 9 * * 1-5` | Weekdays at 09:00 UTC    |
| `0 0 1 * *`   | The first of every month |
| `30 2 * * 0`  | Sundays at 02:30 UTC     |

Cloudflare evaluates schedules in UTC.

## Hand work to a queue

Keep the cron fast and let a [queue](./queues.md) do the slow part, so each item retries on its own:

```ts
// app/crons/daily-digest.ts

import { mainDb } from "@app/db/main_db";
import { digestEmails } from "@modules/digest";
import { queues } from "@space/queues";
import { defineCron } from "spacefn/crons";

export default defineCron("0 8 * * *", async (_event, env) => {
	const emails = await digestEmails(await mainDb((env as { DB: D1Database }).DB));
	await queues.emails.sendBatch(emails);
});
```

`digestEmails` decides who gets a digest and what it says; the cron only delivers the result.

## Background work with `waitUntil`

`ctx.waitUntil` keeps the job alive for work you do not need to await, such as posting a metric:

```ts
// app/crons/heartbeat.ts

import { defineCron } from "spacefn/crons";

export default defineCron("*/5 * * * *", async (event, env, ctx) => {
	ctx.waitUntil(fetch("https://status.example.com/ping", { method: "POST" }));
	console.log("heartbeat", event.cron, new Date(event.scheduledTime).toISOString());
});
```

## Several jobs, one schedule

Files that use the same schedule share one trigger and run together:

```ts
// app/crons/purge-sessions.ts
export default defineCron("0 3 * * *", async (_event, env) => {
	/* ... */
});

// app/crons/purge-uploads.ts
export default defineCron("0 3 * * *", async (_event, env) => {
	/* ... */
});
```

- The schedule is read from the file when the build config loads. Keep cron files free of side effects at import time.
- Jobs that share a schedule run together, each in its own `cron.run` span.
- If one job fails, the others still run, and the scheduled event then reports the failure.

## Related

- [Crons API](../api-reference/crons.md)
- [Scheduled job example](../examples/scheduled-job.md)
- [Queues](./queues.md)
