# Modules

`modules/` at the project root holds business logic that is not a Cloudflare convention. The framework does not scan it; import it from `app/` files with the `@modules/*` alias.

## Layout

```txt
modules/
├── todos/
│   ├── index.ts        → import { ... } from "@modules/todos"
│   ├── schema.ts
│   └── service.ts
└── billing/
    └── invoices.ts     → import { ... } from "@modules/billing/invoices"
```

Keep `app/` for Cloudflare-facing code (routes, queues, crons, durable objects, workflows, db) and `modules/` for domain logic. This keeps the convention folder small and the business logic testable on its own.

## A module

A module is plain TypeScript. Pass in what it needs instead of reaching for globals, so a test can call it directly:

```ts
// modules/todos/service.ts
import { addTodo, listTodos } from "@space/db/main_db";
import { d1Executor } from "spacefn/db";

export async function createTodo(db: D1Database, title: string) {
	const clean = title.trim();
	if (!clean) throw new Error("A todo needs a title");
	await addTodo(d1Executor(db), { title: clean });
	return clean;
}

export function allTodos(db: D1Database) {
	return listTodos(d1Executor(db), {});
}
```

```ts
// modules/todos/index.ts
export { allTodos, createTodo } from "./service";
```

## Use it from a route, page action, queue, or cron

The same function serves every entry point:

```ts
// app/routes/todos.ts
import { allTodos, createTodo } from "@modules/todos";
import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) => allTodos(c.env.DB));

export const POST = defineHandler(async (c) => {
	const { title } = await c.req.json<{ title: string }>();
	return { created: await createTodo(c.env.DB, title) };
});
```

```ts
// app/crons/nightly.ts
import { allTodos } from "@modules/todos";
import { defineCron } from "spacefn/crons";

export default defineCron("0 3 * * *", async (_event, env) => {
	console.log("todos:", (await allTodos((env as { DB: D1Database }).DB)).length);
});
```

## Shared with the browser

Code in `modules/` can also be imported by [client bundles](./client.md). Keep browser-shared modules free of server-only imports such as `cloudflare:workers` or `app/env.ts`, which the client build rejects.

```ts
// modules/greet.ts
export function greet(name = "world") {
	return `Hello, ${name}`;
}
```

## Other shared folders

| Folder     | Alias      | Use it for                           |
| ---------- | ---------- | ------------------------------------ |
| `modules/` | `@modules` | Domain logic, grouped by feature     |
| `utils/`   | `@utils`   | Small pure helpers such as `slugify` |
| `lib/`     | `@lib`     | Wrappers around third-party services |

See [import aliases](../concepts/import-aliases.md) for how the aliases are wired.

## Related

- [Testing guide](../guides/testing.md) for testing a module without a Worker
- [Conventions](../concepts/conventions.md)
