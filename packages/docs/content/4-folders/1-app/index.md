---
icon: folder-code
---

# app/

`app/` is the folder spacefn reads. It finds the pages, routes, databases, queues and jobs by where their files are, and writes the wiring for them into [`.space/`](../7-space.md). It reads the files without running them, so `space gen` is fast and safe.

```txt
app/
├── entry.ts
├── routes/
├── db/
├── queues/
├── crons/
├── assets/
├── durable-objects/
└── workflows/
```

Every folder is optional; `entry.ts` is required. A folder the target can't run, such as `durable-objects/` on Bun, stops `space gen` with an error that says so.

## Wiring only

A file in `app/` connects code to something spacefn serves: a URL, a queue, a schedule. The code itself lives in [`modules/`](../2-modules.md) and [`lib/`](../3-lib.md). A route reads its input and calls a module; a page passes a module's data to a view. That keeps each file in `app/` short enough to read as a list of what's connected:

```ts [app/queues/emails.ts]
import { queue } from "spacefn";

import * as Emails from "#modules/emails/emails.ts";

export default queue({ body: Emails.Email, handler: Emails.send });
```

spacefn doesn't check this; it's how the docs and the examples are written.

## Rules for every folder

- **One default export**, made with its helper: `page(...)`, `route(...)`, `middleware(...)`, `queue(...)`, `cron(...)`. Anything else is an error naming the file.
- **Private files:** a file or folder starting with `_` is skipped, except `_middleware.ts`.
- **Tests:** `*.test.ts` and `*.spec.ts` are skipped, so a test can sit beside the file it tests.
- **Dev-only and prod-only routes:** in `routes/`, `name.dev.ts` exists only under `space dev`, `name.prod.ts` only in builds and deploys.
- **Names:** queue, cron, Durable Object and workflow files are named in lowercase letters, digits and `-`, starting with a letter: `order-jobs.ts`.
