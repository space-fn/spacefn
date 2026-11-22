---
title: queues/
icon: stack-2
---

# app/queues/

One file per queue: the file consumes the queue of its name. `app/queues/emails.ts` is the queue `emails`, and code anywhere in the app sends to it with `Queue.send("emails", body)`.

```txt
app/queues/
├── emails.ts          the queue "emails"
└── order-jobs.ts      the queue "order-jobs"
```

Only files directly in the folder count. Names are lowercase letters, digits and `-`, starting with a letter.

```ts [app/queues/emails.ts]
import { queue } from "spacefn";

import * as Emails from "#modules/emails/emails.ts";

export default queue({ body: Emails.Email, handler: Emails.send, retryDelay: "30 seconds" });
```

| Option        | What it does                                                     |
| ------------- | ---------------------------------------------------------------- |
| `body`        | The Schema each message is decoded with before `handler` sees it |
| `handler`     | `(body, message) => Effect`; a failure retries that message      |
| `concurrency` | How many messages of a batch run at once (default 1, in order)   |
| `retryDelay`  | How long to wait before a retry                                  |

The schema and the handler belong to the feature, in `modules/`, next to a function that sends:

```ts [modules/emails/emails.ts]
import { Schema } from "effect";
import { Queue } from "spacefn";

export const Email = Schema.Struct({ to: Schema.String, subject: Schema.String });

export const later = (email: typeof Email.Type) => Queue.send("emails", email);
```

Delivery is at least once, so make handlers safe to run twice. On Cloudflare each file is a Cloudflare Queue and its consumer; on Bun, a table in the state database read by the queue process.

Read more in [Queues and crons](../../6-guides/7-jobs.md).
