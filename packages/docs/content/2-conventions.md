---
icon: list-tree
---

# Conventions

An app is a folder. spacefn reads it (without running your code) and writes the wiring into `.space/`: `space gen` does it once, `space dev` on every change.

```txt
my-app/
├── app/
│   ├── entry.ts             what runs with the rest      → The entry
│   ├── routes/              pages and HTTP endpoints     → Pages, Routes
│   ├── db/<name>/           migrations/ and queries/     → Database
│   ├── queues/              one consumer per file        → Queues and crons
│   ├── crons/               one scheduled job per file   → Queues and crons
│   ├── assets/              browser scripts and styles   → Frontend
│   ├── durable-objects/     Durable Object classes       (Cloudflare only)
│   └── workflows/           Workflow classes             (Cloudflare only)
├── modules/<feature>/       a feature's code: logic, views, client code, tests
├── lib/                     code features share: UI kit, design tokens, helpers
├── public/                  files served as they are at /  → Frontend
├── configs/
│   ├── env.ts               the variables the app reads
│   ├── infra.ts             the Alchemy stack
│   ├── vite.ts, vitest.ts, tsconfig.json
│   └── Dockerfile           on Bun
└── .space/                  generated
```

[Folders](4-folders/index.md) has a page for each of these, with what goes in it and an example.

Each convention file has one default export, made with a helper: `route(...)`, `page(...)`, `middleware(...)`, `queue(...)`, `cron(...)`. Exporting something else is an error that names the file.

## Where code goes

`app/` is what spacefn reads, so keep it to wiring: a file there connects code from `modules/` and `lib/` to a URL, a queue or the entry, and has no logic or markup of its own. The code itself goes in two folders:

- **`modules/<feature>/`**, one folder per feature: what it does (Effects over the databases and services), its views, its client code and its tests. `modules/todos/`, `modules/billing/`.
- **`lib/`** for what features share and that belongs to none of them: a UI kit with its design tokens, the layout, formatting and auth helpers. `lib/` doesn't import `modules/`.

spacefn doesn't enforce this; it's the layout the docs, the new app and the examples use, so each kind of code has one place to look. A page file then reads as a list of what's connected:

```ts [app/routes/index.ts]
import { Effect, Schema } from "effect";
import { action, actionUrl, Datastar, page, redirect } from "spacefn";

import { layout } from "#lib/ui/layout.ts";
import * as Todos from "#modules/todos/todos.ts";
import { todoList, todosPage } from "#modules/todos/views.ts";

const list = Todos.list.pipe(
	Effect.map((todos) => todoList({ todos, toggle: actionUrl("toggle") })),
);

export default page({
	loader: Effect.map(list, (list) => ({ list })),
	actions: {
		add: action({
			input: Todos.NewTodo,
			handler: (todo) => Effect.as(Todos.add(todo), redirect("/")),
		}),
		toggle: action({
			input: Todos.TodoRef,
			handler: (todo) => Effect.as(Todos.toggle(todo), redirect("/")),
		}),
		live: action({
			method: "get",
			input: Schema.Struct({}),
			handler: () => Datastar.watch([Todos.TOPIC], list),
		}),
	},
	render: (ctx) =>
		layout(
			"Todos",
			todosPage({ list: ctx.data.list, add: ctx.actions.add.url, live: ctx.actions.live.url }),
		),
});
```

```ts [modules/todos/todos.ts]
import { Effect, Schema } from "effect";
import { Bus } from "spacefn";

import MainDb from "#space/db/main.ts";

export const TOPIC = "todos";
export const NewTodo = Schema.Struct({ title: Schema.NonEmptyString });

export const list = MainDb.listTodos();

/** Adds a todo, and tells every open page. */
export const add = ({ title }: typeof NewTodo.Type) =>
	MainDb.addTodo({ title }).pipe(Effect.andThen(Bus.publish(TOPIC, "changed")));
```

Views are functions from plain props to `html`, not from the page's `ctx`: the page passes what they show and the URLs they post to. That keeps them testable alone, and usable from more than one page.

## File names

In `app/routes/`, the path of a file is its URL. Its export decides what it is: a `page(...)` is a server-rendered page, a `route(...)` answers per HTTP method.

| File                 | URL                                         |
| -------------------- | ------------------------------------------- |
| `index.ts`           | `/`                                         |
| `about.ts`           | `/about`                                    |
| `todos/index.ts`     | `/todos`                                    |
| `todos/[id].ts`      | `/todos/:id`, read with `Input.params`      |
| `files/[...path].ts` | `/files/*`, the rest of the path as `path`  |
| `(admin)/users.ts`   | `/users`: a `(group)` folder only organizes |

Parameter names must be identifiers (`[userId]`, not `[user-id]`). Two files for the same URL shape, such as `[id].ts` and `[slug].ts`, are an error.

- **Private files:** a file or folder starting with `_` is never a page, route or job, such as `app/routes/_shared.ts`. Most such code belongs in `modules/` or `lib/` instead.
- **Tests:** `*.test.ts` and `*.spec.ts` files are skipped too, so tests sit next to what they test.
- **Dev-only and prod-only files:** `debug.dev.ts` exists only in `space dev`, `banner.prod.ts` only in builds and deploys.
- **Middleware:** `_middleware.ts` in `app/routes/` wraps every request; in a folder below, it wraps that folder's pages and routes. See [Routes](6-guides/2-routes.md#middleware).
- **Queues and crons** are named after their file: `app/queues/emails.ts` is the queue `emails`.

## Imports

Imports from the app root are [subpath imports](https://nodejs.org/api/packages.html#subpath-imports), declared in `package.json`. Node, TypeScript, Vite, Vitest and Bun all read them, so nothing else needs configuring:

```json [package.json]
{
	"imports": {
		"#lib/*": "./lib/*",
		"#modules/*": "./modules/*",
		"#space/*": "./.space/*"
	}
}
```

- `#space/db/<name>.ts` is the generated database for `app/db/<name>/`.
- `#modules/...` and `#lib/...` are your own code. Add a line for another folder, such as `"#ui/*": "./src/ui/*"`.
- `spacefn/assets` gives `assets("main", ...)`, the `<script>` and `<link>` tags of `app/assets/` entries (see [Frontend](6-guides/4-frontend.md#loading-entries)). The Vite plugin provides it.

Use relative imports with the `.ts` extension inside a folder.
