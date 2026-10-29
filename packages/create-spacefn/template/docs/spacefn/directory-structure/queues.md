# Queues

`app/queues/` holds one queue and its consumer per file. The file name is the queue name.

## Layout

```txt
app/queues/
└── emails.ts
```

## A queue

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

The consumer and its trigger are generated from the file. Sending uses the typed producer generated in `.space/queues.ts`:

```ts
import { queues } from "@space/queues";

await queues.emails.send({ to: "a@example.com", subject: "Welcome" });
await queues.emails.sendBatch([{ to: "b@example.com", subject: "Hi" }]);
```

Each queue name maps to a camelCase producer: `order-jobs.ts` is `queues.orderJobs`.

- A send inside a request is traced. The consumer's `queue.process` span joins that request's trace.
- Each body is sent in an envelope that holds the trace context. Other Workers that read the same queue see the envelope around the body.
- A batch whose messages come from several traces is traced under the first message's trace.
- A batch for a queue with no consumer fails and is retried, so no message is lost.
- A message is acknowledged only when your handler calls `message.ack()` (or `batch.ackAll()`). If the handler throws, the platform can retry the batch; use `message.retry()` when you need to request a retry explicitly.
