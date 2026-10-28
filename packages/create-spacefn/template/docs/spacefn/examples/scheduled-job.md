# Scheduled job

```ts
// app/crons/nightly.ts
import { defineCron } from "spacefn/crons";

export default defineCron("0 3 * * *", async (event) => {
	console.log("NIGHTLY RAN", event.cron);
});
```

See [crons](../directory-structure/crons.md) and [queues](../directory-structure/queues.md).
