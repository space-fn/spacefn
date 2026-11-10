# Directory structure

Every folder in `app/` does one job. The framework finds files by name, so there is no registry to maintain.

`app/` holds setup only: each file reads its input, calls your code, and returns the result. Your code (rules, use cases, fragments, helpers) lives in `modules/`, `utils/`, and `lib/`, which the framework never scans. See [modules, utils, and lib](./modules.md) for the rules.

| Folder                 | What it holds                         | Docs                                                   |
| ---------------------- | ------------------------------------- | ------------------------------------------------------ |
| `app/routes/`          | HTTP endpoints                        | [routes](./routes.md)                                  |
| `app/middleware/`      | Request middleware, run in name order | [middleware](./middleware.md)                          |
| `app/queues/`          | Queue consumers                       | [queues](./queues.md)                                  |
| `app/crons/`           | Scheduled jobs                        | [crons](./crons.md)                                    |
| `app/durable-objects/` | Durable Object classes                | [durable-objects](./durable-objects.md)                |
| `app/workflows/`       | Workflow classes                      | [workflows](./workflows.md)                            |
| `app/pages/`           | Server-rendered pages                 | [pages](./pages.md)                                    |
| `app/client/`          | Browser TS/CSS entries                | [client](./client.md)                                  |
| `app/db/<name>/`       | Migrations and queries                | [database](./database.md)                              |
| `app/env.ts`           | Environment fields                    | [env](./env.md)                                        |
| `modules/`             | Your features, grouped by feature     | [modules](./modules.md)                                |
| `utils/`               | Small pure helpers                    | [modules](./modules.md)                                |
| `lib/`                 | Clients for third-party services      | [modules](./modules.md#lib-wrap-a-third-party-service) |

Files starting with `_` are ignored in every folder. See [Conventions](../concepts/conventions.md) for why.

## One file per folder, in one line

Each convention is a single file with a single default or named export, and each one hands its work to a function from `modules/`:

```ts
// app/routes/hello.ts          → GET /hello
export const GET = defineHandler((c) => greeting(c.req.query("name")));

// app/pages/hello.page.ts      → page at /hello (use a different path from the route)
export default () => html`<h1>${greeting().message}</h1>`;

// app/middleware/01-log.ts     → runs on every request, in name order
export default defineMiddleware(async (c, next) => {
	await next();
});

// app/queues/emails.ts         → the `emails` queue and its consumer
export default defineQueue<Email>(async (batch, env) => {
	const mail = createEmailClient({ apiKey: env.MAIL_API_KEY });
	for (const message of batch.messages) {
		await mail.send(message.body);
		message.ack();
	}
});

// app/crons/nightly.ts         → runs at 03:00 UTC every day
export default defineCron("0 3 * * *", async (event, env) => {
	await deleteExpiredSessions(await mainDb(env.DB), event.scheduledTime);
});

// app/env.ts                   → validates environment values
export default defineEnv({ GREETING: string({ default: "hello" }) });
```

## Where does it go?

| I want to...                                | Put it in                                                             |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Return JSON, accept a webhook, redirect     | `app/routes/`                                                         |
| Render HTML that updates in place           | `app/pages/` with a `*.server.ts` ([Datastar](../guides/datastar.md)) |
| Run code on every request                   | `app/middleware/`                                                     |
| Do slow work after responding               | `app/queues/`                                                         |
| Run something on a schedule                 | `app/crons/`                                                          |
| Keep state per room, user, or tenant        | `app/durable-objects/`                                                |
| Run a multi-step job that survives restarts | `app/workflows/`                                                      |
| Store relational data                       | `app/db/`                                                             |
| Ship browser code or web components         | `app/client/` ([Rocket](../guides/datastar-components.md))            |
| Decide anything about my data or users      | `modules/<feature>/`                                                  |
| Render a fragment several actions re-send   | `modules/<feature>/views.ts`                                          |
| Write a small pure helper                   | `utils/`                                                              |
| Call another company's API                  | `lib/`                                                                |
