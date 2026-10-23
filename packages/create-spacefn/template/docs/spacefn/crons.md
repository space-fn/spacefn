# Crons

`app/crons/` holds scheduled jobs. One file, one job.

## Layout

```txt
app/crons/
└── nightly.ts
```

## A cron job

```ts
// app/crons/nightly.ts
import { defineCron } from "spacefn/crons";

export default defineCron("0 3 * * *", async (event, env) => {
	await cleanup(env);
});
```

- The schedule is read from the file when the build config loads. Keep cron files free of side effects at import time.
- Jobs that share a schedule run together, each in its own `cron.run` span.
- If one job fails, the others still run, and the scheduled event then reports the failure.
