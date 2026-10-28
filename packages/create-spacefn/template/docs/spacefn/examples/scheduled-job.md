# Scheduled job

```ts
// app/crons/digest.ts
import { defineCron } from "spacefn/crons";

export default defineCron("0 9 * * *", async (c) => {
	await c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
});
```

See [crons](../directory-structure/crons.md) and [queues](../directory-structure/queues.md).
