# Modules, utils, and lib

`app/` holds setup code. Everything your project actually does lives outside it, in `modules/`, `utils/`, and `lib/` at the project root. The framework does not scan those folders; `app/` files import from them.

This is the most important convention in a spacefn project. Every example in these docs follows it, and code you or an assistant writes should too.

## The rule

| Folder     | Alias      | Holds                                                     | Knows about the framework?         |
| ---------- | ---------- | --------------------------------------------------------- | ---------------------------------- |
| `app/`     | `@app`     | Setup: convention files that receive work and hand it off | Yes, that is its job               |
| `modules/` | `@modules` | Your project's rules and features, grouped by feature     | Only generated queries (see below) |
| `utils/`   | `@utils`   | Small pure helpers: `slugify`, `formatCents`, `AppError`  | No                                 |
| `lib/`     | `@lib`     | Clients for third-party services: email, payments, APIs   | No                                 |

A file in `app/` is a thin adapter between Cloudflare and your code. It does three things, in order:

1. **Read** the input: params, query, JSON or form body, the queue message, the cron event, the signed-in user.
2. **Call** a module function, passing it what it needs: a database executor, a binding, a config value.
3. **Respond**: turn the result into JSON, an HTML fragment, a status code, an `ack()`.

If an `app/` file contains a business rule (a limit, a state check, a calculation, a decision about what is allowed), that rule belongs in `modules/`.

## What `app/` contains

| `app/` file                                 | Its setup job                                                       |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `routes/*.ts`, `pages/*.server.ts`          | Read the request, call a module, shape the response                 |
| `pages/*.page.ts`                           | The page shell: `<head>`, scripts, layout around fragments          |
| `middleware/*.ts`                           | Wire framework middleware (sessions, CSRF, tenancy)                 |
| `queues/*.ts`, `crons/*.ts`                 | Unpack the message or event, call a module, ack or retry            |
| `durable-objects/*.ts`, `workflows/*.ts`    | Hold the class Cloudflare needs; each method or step calls a module |
| `db/<name>/migrations`, `db/<name>/queries` | SQL schema and the queries spacefn turns into functions             |
| `db/<name>.ts`                              | Connect: run migrations, return a ready executor                    |
| `client/*.ts`                               | Browser entries: find elements, attach listeners, call modules      |
| `env.ts`, `entry.ts`                        | The environment schema; app creation and error mapping              |

## What `modules/`, `utils/`, and `lib/` may import

Code outside `app/` must run without a request, a Worker, or the dev server, so a plain unit test can call it.

**Allowed:**

- Other modules, `@utils/*`, and `@lib/*`.
- Generated database functions and row types from `@space/db/<name>`, and the `DbReader` type from `spacefn/db`. SQL is part of your project, and the generated functions are plain functions of an executor.
- Pure spacefn helpers that need no request: `spacefn/auth` hashing, tokens and TOTP, and `html`/`raw` from `spacefn/html` for markup fragments.
- Types from any spacefn entry, imported with `import type` (for example `TenantRecord` from `spacefn/tenancy`). A type-only import adds no runtime dependency.

**Not allowed:**

- The request context (`c`), and anything that needs it: `spacefn/handler`, `spacefn/pages`, `spacefn/middleware`, `spacefn/http`, `currentTenant`.
- Convention definers: `defineQueue`, `defineCron`, `DurableObject`, `WorkflowEntrypoint`.
- Environment access: `spacefn/env`, `@app/env`, `cloudflare:workers` `env`. Take the value as an argument instead.
- Queue producers and Worker plumbing: `@space/queues`, `@space/worker`. Take a `send` function instead.
- Anything under `@app/*`. Dependencies point from `app/` into your code, never back.

`utils/` and `lib/` are stricter still: no spacefn imports at all, and no `@space/*`.

## Pass in what a module needs

A module function receives its dependencies as arguments. Bindings are typed with the narrow shape the module uses, so a test can pass a plain object.

```ts
// modules/todos/todos.ts

import { addTodo, findTodo, listTodos } from "@space/db/main_db";
import { AppError } from "@utils/errors";
import type { DbReader } from "spacefn/db";

export const MAX_TITLE = 200;

export function todoTitle(input: unknown): string {
	const title = String(input ?? "").trim();
	if (!title) throw new AppError("invalid", "A todo needs a title.");
	if (title.length > MAX_TITLE) {
		throw new AppError("invalid", `Keep titles under ${MAX_TITLE} characters.`);
	}
	return title;
}

export async function createTodo(db: DbReader, input: { title?: unknown }) {
	await addTodo(db, { title: todoTitle(input.title) });
	return listTodos(db, {});
}

export function allTodos(db: DbReader) {
	return listTodos(db, {});
}

export async function todoById(db: DbReader, rawId: string | undefined) {
	const id = Number(rawId);
	if (!Number.isSafeInteger(id)) throw new AppError("invalid", "The id must be a whole number.");
	const todo = await findTodo(db, { id });
	if (!todo) throw new AppError("not_found", "No such todo.");
	return todo;
}
```

```ts
// modules/todos/index.ts — the module's public surface
export { allTodos, createTodo, MAX_TITLE, todoById, todoTitle } from "./todos";
export { todoList } from "./views";
```

Import a module through its `index.ts` (`@modules/todos`). Files inside the module import each other relatively.

## Connect the database once

Every database gets one small setup file in `app/db/` that applies migrations and returns the executor modules accept:

```ts
// app/db/main_db.ts

import { migrated } from "@space/db/main_db";
import { d1Executor, type DbReader } from "spacefn/db";

export async function mainDb(binding: D1Database): Promise<DbReader> {
	await migrated(binding);
	return d1Executor(binding);
}
```

spacefn reads only `migrations/`, `queries/`, and `config.ts` inside `app/db/<name>/`, so this file sits beside the folder, not in it.

## The entry files stay thin

```ts
// app/routes/todos.ts

import { mainDb } from "@app/db/main_db";
import { allTodos, createTodo } from "@modules/todos";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler(async (c) => allTodos(await mainDb(c.env.DB)));

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ title?: unknown }>();
	return c.json(await createTodo(await mainDb(c.env.DB), body), 201);
});
```

```ts
// app/crons/report.ts

import { mainDb } from "@app/db/main_db";
import { allTodos } from "@modules/todos";
import { defineCron } from "spacefn/crons";

export default defineCron("0 3 * * *", async (_event, env) => {
	const todos = await allTodos(await mainDb((env as { DB: D1Database }).DB));
	console.log("todos:", todos.length);
});
```

The route and the cron share `allTodos`; neither knows how a todo is validated or stored.

## Errors cross the boundary as `AppError`

A module reports a problem the caller can act on by throwing an `AppError`. It says what kind of failure it is, not which HTTP status to send, because the same function also runs in queues and crons.

```ts
// utils/errors.ts
export type ErrorKind = "invalid" | "unauthorized" | "forbidden" | "not_found" | "conflict";

export class AppError extends Error {
	constructor(
		readonly kind: ErrorKind,
		message: string,
		readonly code: string = kind,
	) {
		super(message);
		this.name = "AppError";
	}
}
```

`app/entry.ts` maps the kind to a status in one place:

```ts
// app/entry.ts

import { createApp, mountApp, registerRoutes } from "@space/worker";
import { AppError, type ErrorKind } from "@utils/errors";
import { onError } from "spacefn/handler";

import schema from "./env";

const STATUS: Record<ErrorKind, 400 | 401 | 403 | 404 | 409> = {
	invalid: 400,
	unauthorized: 401,
	forbidden: 403,
	not_found: 404,
	conflict: 409,
};

const app = createApp({ env: schema });

app.onError((error, c) =>
	error instanceof AppError
		? c.json({ error: error.code, message: error.message }, STATUS[error.kind])
		: onError(error, c),
);

registerRoutes(app);

export * from "@space/exports";
export default mountApp(app);
```

A page action that answers with an HTML fragment catches the `AppError` itself and renders the message; see the [todo board](../examples/todo-crud.md).

## Markup fragments

The page shell (`<html>`, `<head>`, scripts) is setup and stays in `app/pages/*.page.ts`. Reusable fragments that render your data, such as a list that page actions re-send after a change, live in the module as `views.ts`, built with `html` from `spacefn/html`:

```ts
// modules/todos/views.ts

import { html } from "spacefn/html";

export function todoList(todos: { id: number; title: string }[]) {
	return html`<ul id="todos">
		${todos.map((todo) => html`<li>${todo.title}</li>`)}
	</ul>`;
}
```

A fragment takes plain values. Paths to page actions are passed in by the page or action that renders it.

## Layout of a module

```txt
modules/
└── todos/
    ├── index.ts        public surface: import from "@modules/todos"
    ├── todos.ts        rules and use cases
    ├── views.ts        HTML fragments (optional)
    └── todos.test.ts   unit tests, no Worker needed
utils/
├── errors.ts           AppError
└── slug.ts
lib/
└── email.ts            createEmailClient({ apiKey, fetch })
```

Group by feature, not by kind: `modules/billing/`, not `modules/services/`. A module may import another module's `index.ts`.

## `lib/`: wrap a third-party service

A `lib/` client takes its configuration as arguments, so it never reads the environment and a test can hand it a fake `fetch`:

```ts
// lib/email.ts
export interface Email {
	to: string;
	subject: string;
	body: string;
}

export function createEmailClient(options: { apiKey: string; fetch?: typeof fetch }) {
	const send = options.fetch ?? fetch;
	return {
		async send(email: Email) {
			const response = await send("https://api.mail.example/send", {
				method: "POST",
				headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
				body: JSON.stringify(email),
			});
			if (!response.ok) throw new Error(`Email failed with ${response.status}`);
		},
	};
}
```

The `app/` file that needs it builds the client from the environment: `createEmailClient({ apiKey: c.env.MAIL_API_KEY })`.

## Test a module directly

Because a module takes its dependencies as arguments, its tests need no Worker:

```ts
// modules/todos/todos.test.ts

import { AppError } from "@utils/errors";
import { expect, test } from "vite-plus/test";

import { todoTitle } from "./todos";

test("trims a title", () => {
	expect(todoTitle("  Buy milk ")).toBe("Buy milk");
});

test("rejects an empty title", () => {
	expect(() => todoTitle("   ")).toThrow(AppError);
});
```

For functions that query the database, see the [testing guide](../guides/testing.md).

## Shared with the browser

[Client bundles](./client.md) can import from `modules/` and `utils/` too, which lets the browser and the server share one validator. Keep a browser-shared file free of `@space/db/*` and server-only APIs; the client build rejects `cloudflare:workers` and `app/env.ts`.

## Checklist

Before adding code to `app/`, check:

- Does it make a decision about your data or your users? Move it to `modules/`.
- Is it a pure helper used in more than one place? Move it to `utils/`.
- Does it call another company's API? Wrap it in `lib/`.
- Does a module read `c`, `env`, or a queue producer? Pass the value in instead.

## Related

- [Conventions](../concepts/conventions.md)
- [Import aliases](../concepts/import-aliases.md)
- [Testing guide](../guides/testing.md)
