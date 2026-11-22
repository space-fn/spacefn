---
title: modules/
icon: puzzle
---

# modules/

One folder per feature: what it does, how it looks, its browser code and its tests, side by side. `app/` files import from here and connect it to URLs, queues and schedules.

```txt
modules/
├── todos/
│   ├── todos.ts           what the feature does: Effects over the database and services
│   ├── views.ts           its HTML: functions from props to html
│   ├── todos.css          its styles, imported by app/assets/site.css
│   ├── ui/                its client components, and the islands that start them
│   │   ├── TodoList.tsx
│   │   └── todo-list.island.tsx
│   ├── client/            its other browser code, such as web components
│   └── todos.test.ts      its tests
└── billing/
    ├── billing.ts
    ├── stripe.ts          a service only this feature uses
    └── billing.test.ts
```

Import it with `#modules/...`, declared in `package.json`:

```ts [app/routes/index.ts]
import * as Todos from "#modules/todos/todos.ts";
import { todosPage } from "#modules/todos/views.ts";
```

## What goes in a feature

**Logic** is Effects over the generated databases and spacefn's services. Name them for what the feature does, not for the HTTP call that triggers them:

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

**Views** take plain props: what they show and the URLs they post to. Not a page's `ctx`, so a test or a live update can render them alone:

```ts [modules/todos/views.ts]
import { html } from "spacefn";

export const todoList = (props: { readonly todos: readonly { title: string }[] }) =>
	html`<ul id="todo-list">
		${props.todos.map((todo) => html`<li>${todo.title}</li>`)}
	</ul>`;
```

**Tests** sit next to the code, as `*.test.ts`; `npm test` finds them.

## Between features

A feature can use another's exported functions, but keep the arrows one way: if `billing` uses `accounts`, `accounts` doesn't use `billing`. Code that two features need and neither owns moves to [`lib/`](3-lib.md).

spacefn doesn't read this folder; it's a convention, not a rule. Read more in [Best practices](../3-best-practices.md).
