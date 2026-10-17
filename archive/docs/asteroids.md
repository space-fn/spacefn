# @spacefn/asteroids

All-in-one package for the SpaceFn ecosystem. Ships as a single bundle with zero npm dependencies (except optional `hono` peer dep).

Re-exports everything from `@spacefn/html`, `@spacefn/css`, `@spacefn/datastar`, `@spacefn/db`, plus Hono utilities and Vite code generators.

## Install

```bash
pnpm add @spacefn/asteroids hono
```

Or install individual packages:

```bash
pnpm add @spacefn/html @spacefn/css @spacefn/datastar @spacefn/db hono
```

## Quick start

```ts
import { h, render, css, ds, defineSchema, column } from "@spacefn/asteroids";
import { defineRoute, defineLoader } from "@spacefn/asteroids/hono";
```

## Exports

### Main entry (`@spacefn/asteroids`)

Re-exports from all packages:

- `h`, `render`, `defineComponent`, `raw` — from `@spacefn/html`
- `sx`, `getCSS`, `css` — from `@spacefn/css`
- `ds`, `dataSignal`, `dataOn`, `patchElements`, `patchSignals` — from `@spacefn/datastar`
- `column`, `defineSchema`, `generateTypes`, `migrate` — from `@spacefn/db`
- `mergeAttrs` (as `h.attrs`) — merge attribute objects

### Hono entry (`@spacefn/asteroids/hono`)

```ts
import {
	defineRoute,
	defineLoader,
	defineActions,
	definePage,
	html,
} from "@spacefn/asteroids/hono";
```

| Helper                   | Description                           |
| ------------------------ | ------------------------------------- |
| `defineRoute(handler)`   | Typed Hono route handler              |
| `defineLoader(loader)`   | Typed page data loader                |
| `defineActions(actions)` | Named action resolvers                |
| `definePage(component)`  | Page component with typed loader data |
| `html(element)`          | Render `HtmlElement` to `Response`    |

### Vite entry (`@spacefn/asteroids/vite`)

```ts
import { generators, apiGenerator, pageGenerator, dbGenerator } from "@spacefn/asteroids/vite";
```

## Features

- **HTML** — Functional, escaped rendering with typed attributes
- **CSS** — Deterministic classes, tokens, variants, transitions
- **DataStar** — Typed client attributes, SSE helpers
- **Database** — Schema definitions, type generation, migrations
- **Hono** — Route, loader, action, and page helpers
- **Vite** — Code generators for routes, pages, and database

## Zero-dependency bundle

Asteroids bundles all `@spacefn/*` packages into a single file. Users get one import with no transitive npm dependencies. All SpaceFn packages are inlined into the bundle.

See [getting-started.md](./getting-started.md) for setup guide.
