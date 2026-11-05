# Conventions

Spacefn has no registry. You add a file, and the framework picks it up. This page explains the idea; the [directory structure](../directory-structure/) section documents each folder.

## Found by name

Every folder in `app/` has a job. Files inside it are discovered by their name and exported shape:

- `app/routes/todos.ts` with a `GET` export becomes `GET /todos`.
- `app/queues/emails.ts` with a default export becomes the `emails` queue.
- `app/crons/nightly.ts` becomes a cron job.

You never list them anywhere. Add the file, save, and the next dev start (or build) picks it up.

## Follow a request

Create `app/routes/greet.ts`:

```ts
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) => {
	const name = c.req.query("name") ?? "world";
	return { message: `Hello, ${name}!` };
});
```

That one file registers `GET /greet`. A request to `/greet?name=Sam` returns:

```json
{ "message": "Hello, Sam!" }
```

No route table needs editing. `app/middleware/` still wraps the request, and
the default handler turns the returned object into JSON. See [routes](../directory-structure/routes.md)
for parameters, response types, and errors.

## Ignored files

Files starting with `_` are ignored. Use them for shared modules inside a folder:

```txt
app/routes/
├── todos.ts
└── _helpers.ts   # not a route
```

## One job per folder

Each folder does one thing. Don't mix concerns: a queue consumer doesn't live in `app/routes/`. When in doubt, check the [directory structure](../directory-structure/) table.

For example, the route can enqueue slow work instead of sending an email
inline:

```ts
import { queues } from "@space/queues";
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	await queues.emails.send({ to: "a@example.test", subject: "Welcome" });
	return c.json({ queued: true }, 202);
});
```

The queue consumer belongs in `app/queues/emails.ts`; see the
[queue convention](../directory-structure/queues.md).

## The `modules/` folder

Business logic that isn't a Cloudflare convention goes in `modules/` at the project root. Spacefn doesn't scan it; you import it from `app/`. See [modules](../directory-structure/modules.md).
