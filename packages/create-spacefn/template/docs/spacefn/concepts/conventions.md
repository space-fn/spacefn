# Conventions

Spacefn has no registry. You add a file, and the framework picks it up. And `app/` holds only setup: the code your project actually runs lives in `modules/`, `utils/`, and `lib/`. This page explains both ideas; the [directory structure](../directory-structure/) section documents each folder.

## Found by name

Every folder in `app/` has a job. Files inside it are discovered by their name and exported shape:

- `app/routes/todos.ts` with a `GET` export becomes `GET /todos`.
- `app/queues/emails.ts` with a default export becomes the `emails` queue.
- `app/crons/nightly.ts` becomes a cron job.

You never list them anywhere. Add the file, save, and the next dev start (or build) picks it up.

## `app/` is setup, the rest is your code

A file in `app/` connects Cloudflare to your code. It reads the input, calls a function from `modules/`, and turns the result into a response. The function itself, with its rules and decisions, lives outside `app/`:

| Folder     | Holds                                                               |
| ---------- | ------------------------------------------------------------------- |
| `app/`     | Setup: routes, pages, queues, crons, middleware, SQL, env           |
| `modules/` | Your features: rules, use cases, HTML fragments, grouped by feature |
| `utils/`   | Small pure helpers                                                  |
| `lib/`     | Clients for third-party services                                    |

Code outside `app/` never touches the request context or the environment. It receives what it needs as arguments, so the same function serves a route, a queue, and a cron, and a plain unit test can call it. [Modules, utils, and lib](../directory-structure/modules.md) has the full rules, including what those folders may import.

## Follow a request

The rule is in `modules/`:

```ts
// modules/greetings/index.ts
export function greeting(name?: string) {
	const who = name?.trim() || "world";
	return { message: `Hello, ${who}!` };
}
```

The route is the setup: read the query, call the module, return the result.

```ts
// app/routes/greet.ts

import { greeting } from "@modules/greetings";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) => greeting(c.req.query("name")));
```

That file registers `GET /greet`. A request to `/greet?name=Sam` returns:

```json
{ "message": "Hello, Sam!" }
```

No route table needs editing. `app/middleware/` still wraps the request, and the default handler turns the returned object into JSON. See [routes](../directory-structure/routes.md) for parameters, response types, and errors.

## Ignored files

Files starting with `_` are ignored by every convention folder. Use them for setup helpers that several files in that folder share, such as a page shell:

```txt
app/pages/
├── todos.page.ts
└── _layout.ts   # not a page
```

Shared logic does not go in a `_` file; it goes in `modules/`.

## One job per folder

Each folder does one thing. A queue consumer doesn't live in `app/routes/`, and a business rule doesn't live in `app/` at all. When in doubt, check the [directory structure](../directory-structure/) table.

For example, signing up enqueues the welcome email instead of sending it inline. The module decides what the email says and hands it to a `send` function; the route supplies the queue producer:

```ts
// modules/accounts/welcome.ts

import type { Email } from "@lib/email";

export async function sendWelcome(send: (email: Email) => Promise<void>, to: string) {
	await send({ to, subject: "Welcome", body: "Thanks for signing up." });
}
```

```ts
// app/routes/welcome.ts

import { sendWelcome } from "@modules/accounts/welcome";
import { queues } from "@space/queues";
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const { email } = await c.req.json<{ email: string }>();
	await sendWelcome((job) => queues.emails.send(job), email);
	return c.json({ queued: true }, 202);
});
```

The queue consumer belongs in `app/queues/emails.ts`; see the [queue convention](../directory-structure/queues.md).
