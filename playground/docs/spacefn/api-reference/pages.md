# Pages

## `definePage`

```ts
import { definePage, html } from "spacefn/pages";

export default definePage<{ todos: { title: string }[] }>((props) => html`...`);
```

A page is a function from data to markup. `definePage<Props>` types the props the page receives. Use `definePage<typeof loader>` to keep the page in step with its loader.

## `defineLoader`

```ts
import { defineLoader } from "spacefn/pages";

export const loader = defineLoader(async (c) => ({
	todos: await listTodos(c.env.DB, {}),
}));
```

Runs on `GET`. Returning a `Response` (for example a redirect) short-circuits rendering.

## `defineActions`

```ts
import { defineActions } from "spacefn/pages";

export const actions = defineActions({
	add: async (c) => {
		/* ... */ return;
	}, // return nothing -> 303 redirect back
});
```

Each action is callable and gains `.path(): string`, which returns `?_action=<name>`.

## `html` and `raw`

- `html` template tag escapes every interpolated value. Arrays are joined; `null`, `undefined` and `false` render nothing.
- `raw(markup)` places markup unchanged. Use only for markup you built yourself.

## `mountPage`

Used by the generated `.space/pages.ts`. Not usually called by hand:

```ts
mountPage(app, "/board", page, server);
```

See [pages](../directory-structure/pages.md) for the folder convention.
