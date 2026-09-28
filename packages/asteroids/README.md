# @spacefn/asteroids

Umbrella package for the SpaceFn ecosystem. Re-exports everything from `@spacefn/html`, `@spacefn/css`, `@spacefn/datastar`, `@spacefn/db`, and adds Hono utilities.

```ts
import { h, render, css, ds, defineSchema, column } from "@spacefn/asteroids";
```

## Hono utilities

```ts
import { defineRoute, defineLoader, defineActions, definePage, html } from "@spacefn/asteroids/hono";
```

- `defineRoute(handler)` — typed route handler
- `defineLoader(loader)` — typed data loader
- `defineActions(actions)` — action map with `?_action=` paths
- `definePage(component)` — typed page component
- `html(el)` — render `HtmlElement` to `Response`

## Vite plugin

```ts
import { generators, apiGenerator, pageGenerator, dbGenerator } from "@spacefn/asteroids/vite";
```

Code generators for API routes, pages, and database schemas. Watches source files and regenerates on change.

## Bundle

Asteroids ships as a single bundled package with zero npm dependencies (except `hono` peer dep). All SpaceFn packages are inlined into the dist.
