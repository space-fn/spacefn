# Crons API (`spacefn/crons`)

Define scheduled jobs in `app/crons/`; each default export is named after its
file. See the [crons convention](../directory-structure/crons.md) for folder
layout and deployment.

```ts
import { defineCron } from "spacefn/crons";

export default defineCron("0 3 * * *", async (event, env, ctx) => {
	ctx.waitUntil(cleanup(event.scheduledTime));
});
```

`defineCron(schedule, run)` returns a `CronJob`. The schedule must have five
whitespace-separated cron fields. `CronHandler` receives:

- `CronEvent`: the fired `cron` expression and `scheduledTime` in epoch milliseconds.
- `env`: Worker bindings.
- `CronContext`: the `waitUntil(promise)` execution-context method.

`cronConfig(schedules)` creates one scheduled trigger for each distinct
schedule. At runtime, `dispatchScheduled(event, env, ctx, jobs)` runs all
matching jobs concurrently; it records failures and rejects after every due
job has settled. `loadCronJobs(root)` imports the default export of each cron
file under `<root>/app/crons`. Keep cron module top-level code free of side
effects because the build loads these files to read their schedules.
