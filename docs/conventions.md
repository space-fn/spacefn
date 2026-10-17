# Folder conventions

Each folder in a spacefn project does one job. Files are found by name, so there is no registry to maintain.

| Folder            | Each file is                                     | Generated                                       |
| ----------------- | ------------------------------------------------ | ----------------------------------------------- |
| `app/routes/`     | HTTP endpoints, named exports `GET`, `POST`, ... | Route table                                     |
| `app/middleware/` | One middleware, run in name order                | `app.use` calls                                 |
| `app/queues/`     | One queue and its consumer                       | Queue binding, consumer trigger, typed producer |
| `app/crons/`      | One scheduled job                                | Scheduled trigger                               |
| `app/env.ts`      | Environment fields                               | Bindings and types                              |

## Middleware

```ts
// app/middleware/01-powered-by.ts
import { defineMiddleware } from "spacefn";

export default defineMiddleware(async (c, next) => {
	await next();
	c.res.headers.set("x-powered-by", "spacefn");
});
```

- Files run in name order. Use numeric prefixes such as `01-auth.ts` and `02-audit.ts` to set the order.
- Files starting with `_` are ignored.
- Middleware runs after tracing and env validation, so it is traced and can read `env`.

## Queues

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

The file name is the queue name. The consumer and its trigger are generated from the file. Sending uses the typed producer generated in `.space/queues.ts`:

```ts
import { queues } from "../.space/queues";

await queues.emails.send({ to: "a@example.com", subject: "Welcome" });
await queues.emails.sendBatch([{ to: "b@example.com", subject: "Hi" }]);
```

Each queue name maps to a camelCase producer: `order-jobs.ts` is `queues.orderJobs`.

- A send inside a request is traced. The consumer's `queue.process` span joins that request's trace.
- Each body is sent in an envelope that holds the trace context. Other Workers that read the same queue see the envelope around the body.
- A batch whose messages come from several traces is traced under the first message's trace.
- A batch for a queue with no consumer fails and is retried, so no message is lost.

## Crons

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

## Bindings and env in jobs

Queue consumers and cron jobs get the same bindings as a request: `env` fields, D1, KV, queue producers and Durable Objects are all traced.
