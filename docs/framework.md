# SpaceFn framework

SpaceFn uses Hono for routing, middleware, and page handling. The `@spacefn/asteroids` package provides typed helpers that integrate with `@spacefn/html`, `@spacefn/css`, and `@spacefn/datastar`.

## Entry point

```ts
import { Hono } from "hono";
import { html } from "@spacefn/asteroids/hono";
import { h } from "@spacefn/asteroids";

const app = new Hono();

app.get("/", (c) => {
  return html(
    h.html({}, h.head({}, h.title({}, "Home")), h.body({}, h.h1({}, "Hello"))),
  );
});

export default app;
```

## Routes

Routes are standard Hono handlers:

```ts
import { Hono } from "hono";
import { h } from "@spacefn/asteroids";

const app = new Hono();

app.get("/health", (c) => c.text("ok"));

app.get("/users/:id", (c) => {
  const id = c.req.param("id");
  return c.json({ id });
});
```

## Pages

Pages use `defineLoader`, `defineActions`, and `definePage` from `@spacefn/asteroids/hono`:

```ts
// src/pages/profile.server.ts
import { defineLoader, defineActions } from "@spacefn/asteroids/hono";

export const loader = defineLoader(async (c) => {
  const user = await loadUser(c.req.param("id"));
  return { user };
});

export const actions = defineActions({
  save: {
    resolver: async (c) => {
      const data = await c.req.formData();
      await saveProfile(data);
      return new Response("Saved");
    },
  },
});
```

```ts
// src/pages/profile.page.ts
import { definePage } from "@spacefn/asteroids/hono";
import { h } from "@spacefn/asteroids";

export default definePage<{ user: { name: string } }>((data) =>
  h.html({}, h.body({}, h.h1({}, data.user.name))),
);
```

POST actions are selected with the `_action` query parameter.

## Middleware

Middleware is scanned from `src/middlewares/**/*.ts` and ordered lexically. Prefix files with numbers when order matters (`01-auth.ts`, `02-logging.ts`).

```ts
import type { MiddlewareHandler } from "hono";

const auth: MiddlewareHandler = async (c, next) => {
  if (!c.req.header("authorization")) {
    return c.text("Unauthorized", 401);
  }
  return next();
};

export default auth;
```

## DataStar integration

Use `h.attrs()` to merge DataStar helpers with regular attributes:

```ts
import { h, ds } from "@spacefn/asteroids";

h.button(
  h.attrs(
    ds.dataSignal("count", "0"),
    ds.dataOn("click", "$count++"),
    { class: "btn btn-primary" },
  ),
  "Click me",
);
```

## CSS integration

```ts
import { h } from "@spacefn/asteroids";
import { getCSS, sx } from "@spacefn/css";

const button = sx.css.id("button").style(() => ({
  base: { padding: "0.5rem 1rem", borderRadius: "0.25rem" },
}));

const stylesheet = getCSS({ styles: [button] });

h.html(
  {},
  h.head({}, h.style({}, stylesheet)),
  h.body({}, h.button({ class: button.base }, "Save")),
);
```

## Related packages

- [`@spacefn/html`](./html.md) renders escaped HTML and components.
- [`@spacefn/css`](./css.md) produces deterministic classes and CSS.
- [`@spacefn/datastar`](./datastar.md) adds DataStar interactions and SSE.
- [`@spacefn/db`](./db.md) schema definitions and migrations.
- [`@spacefn/vite-plugin`](./vite-plugin.md) code generators for routes, pages, and database.
- [`@spacefn/cli`](./cli.md) unified CLI commands.
- [`@spacefn/asteroids`](./asteroids.md) umbrella package re-exporting everything.
