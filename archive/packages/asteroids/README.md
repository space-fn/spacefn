# @spacefn/asteroids

All-in-one package for the SpaceFn ecosystem. Ships as a single bundle with zero npm dependencies (except optional `hono` peer dep).

Re-exports everything from `@spacefn/html`, `@spacefn/css`, `@spacefn/datastar`, `@spacefn/db`, plus Hono utilities and Vite code generators.

```ts
import { h, render, css, ds, defineSchema, column } from "@spacefn/asteroids";
import { defineRoute, defineLoader } from "@spacefn/asteroids/hono";
```

## Table of contents

- [Setup guide](#setup-guide)
- [CLI](#cli)
- [HTML](#html)
- [CSS](#css)
- [DataStar](#datastar)
- [Database](#database)
- [Hono utilities](#hono-utilities)
- [Vite plugin](#vite-plugin)

---

## Setup guide

Step-by-step setup for Hono + Cloudflare Vite + Asteroids from scratch.

### 1. Create project

```bash
mkdir my-app && cd my-app
pnpm init
```

Edit `package.json`:

```json
{
	"name": "my-app",
	"version": "0.0.1",
	"type": "module",
	"scripts": {
		"dev": "vite",
		"build": "vite build",
		"deploy": "wrangler deploy"
	}
}
```

### 2. Install dependencies

```bash
pnpm add @spacefn/asteroids hono
pnpm add -D wrangler vite @cloudflare/vite-plugin typescript
```

### 3. Configure TypeScript

Create `tsconfig.json`:

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"strict": true,
		"skipLibCheck": true,
		"types": ["node"]
	},
	"include": ["src"]
}
```

### 4. Configure Vite

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import cloudflare from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [cloudflare()],
});
```

### 5. Configure Cloudflare Workers

Create `wrangler.jsonc`:

```jsonc
{
	"name": "my-app",
	"main": "src/worker.ts",
	"compatibility_date": "2024-01-01",
}
```

### 6. Create entry point

Create `src/worker.ts`:

```ts
import { Hono } from "hono";
import { html } from "@spacefn/asteroids/hono";
import { h } from "@spacefn/asteroids";

const app = new Hono();

app.get("/", (c) => {
	return html(
		h.html({}, h.head({}, h.title({}, "My App")), h.body({}, h.h1({}, "Hello from SpaceFn!"))),
	);
});

export default app;
```

### 7. Run it

```bash
pnpm dev
```

Open `http://localhost:5173` — you should see "Hello from SpaceFn!".

### 8. Deploy

```bash
pnpm build
pnpm deploy
```

---

## CLI

`@spacefn/cli` provides a unified `space` command for all project tasks. Install it alongside your other deps:

```bash
pnpm add -D @spacefn/cli @biomejs/biome vite vitest
```

### Commands

| Command               | Description                    |
| --------------------- | ------------------------------ |
| `space dev`           | Start Vite dev server          |
| `space build`         | Build for production           |
| `space test`          | Run tests with Vitest          |
| `space fmt`           | Format code with Biome         |
| `space fmt --check`   | Check formatting (don't write) |
| `space lint`          | Lint code with Biome           |
| `space lint --fix`    | Lint and auto-fix issues       |
| `space check`         | Run fmt + lint + typecheck     |
| `space run <name>`    | Run script from `scripts/`     |
| `space run -- --list` | List available scripts         |
| `space db:generate`   | Generate migration from schema |
| `space db:migrate`    | Run pending migrations         |

### Script runner

Create a `scripts/` directory for custom scripts:

```ts
// scripts/db:seed.ts
import { log } from "@spacefn/cli";

export default async function () {
	log.info("Seeding database...");
	// Your seed logic here
	log.success("Done!");
}
```

Run it:

```bash
space run db:seed
```

### Typed scripts with defineCmd

For scripts with arguments and flags, use `defineCmd`:

```ts
// scripts/db:seed.ts
import { defineCmd, log } from "@spacefn/cli";

export default defineCmd({
	meta: { name: "db:seed", description: "Seed the database" },
	args: {
		count: { type: "number", description: "Number of records", default: 10 },
		clear: { type: "boolean", description: "Clear existing data first", alias: "c" },
	},
	async run({ args }) {
		log.info(`Seeding ${args.count} records...`);
		if (args.clear) log.info("Clearing existing data...");
		// Your seed logic here
		log.success("Done!");
	},
});
```

Run with args:

```bash
space run db:seed -- --count 20
space run db:seed -- --count 20 -c
```

### Utilities

Import CLI helpers for your own scripts:

```ts
import { log, spinner, exec, table, steps } from "@spacefn/cli";

log.success("It works!");

await spinner("Loading...", async () => {
	await fetchData();
});

await exec("echo", ["hello"]);
```

---

## HTML

Server-side HTML rendering with typed attributes, escaping, and components.

### Basic usage

```ts
import { h, render } from "@spacefn/asteroids";

const element = h.div(
	{ class: "card", id: "welcome" },
	h.h1({}, "Welcome"),
	h.p({}, "Rendered on the server."),
);

const html = render(element);
// <div class="card" id="welcome"><h1>Welcome</h1><p>Rendered on the server.</p></div>
```

All text and attribute values are escaped. Void elements (`img`, `input`, `br`, etc.) never receive a closing tag.

### Tags

Every HTML tag is available on the `h` namespace: `h.div()`, `h.span()`, `h.a()`, `h.button()`, etc. Attributes are typed per element — `img` requires `alt`, `a` requires `href`, and so on.

```ts
h.img({ src: "/logo.svg", alt: "SpaceFn" });
// <img src="/logo.svg" alt="SpaceFn">

h.a({ href: "/docs" }, "Docs");
// <a href="/docs">Docs</a>
```

### Null and boolean attributes

Attributes with `false`, `null`, or `undefined` are omitted. `true` renders a boolean attribute without a value.

```ts
h.input({ type: "text", disabled: true, readonly: false });
// <input type="text" disabled>
```

### Merging attributes

Use `h.attrs()` to merge multiple attribute objects. Later objects override earlier ones:

```ts
const base = { class: "btn", disabled: false };
const primary = { class: "btn-primary" };

h.button(h.attrs(base, primary, { id: "submit" }), "Save");
// <button class="btn-primary" id="submit">Save</button>
```

This is especially useful with DataStar helpers — see the [DataStar section](#datastar).

### Raw HTML

`raw()` bypasses escaping. Only use it for trusted, already-sanitized markup.

```ts
import { raw } from "@spacefn/asteroids";

h.div({}, raw("<strong>trusted</strong>"));
```

### Components

`defineComponent` creates reusable components with typed props and optional slots:

```ts
import { defineComponent, render, h, type HtmlElement } from "@spacefn/asteroids";

type CardProps = { title: string };
type CardSlots = { default: HtmlElement; footer: HtmlElement };

const Card = defineComponent<CardProps, CardSlots>((props, slots) =>
	h.article({ class: "card" }, h.h2({}, props.title), slots.default, slots.footer),
);

const html = render(
	Card(
		{ title: "Hello" },
		{
			default: h.p({}, "Content"),
			footer: h.small({}, "Footer"),
		},
	),
);
```

Plain functions work too when slots aren't needed:

```ts
const Heading = (title: string) => h.h1({}, title);
```

---

## CSS

Server-rendered CSS with deterministic class names, design tokens, variants, and transitions.

### Basic usage

```ts
import { css, getCSS } from "@spacefn/asteroids";

const card = css("card", {
	base: {
		background: "white",
		padding: "1rem",
		borderRadius: "0.5rem",
	},
	hover: {
		"&:hover": { boxShadow: "0 2px 8px #0002" },
	},
});

// card.base → "card-abc123"
// card.hover → "card-abc123-hover"

const stylesheet = getCSS({ styles: [card] });
```

### Design tokens

Tokens become CSS custom properties (`var(--token-path)`) in generated output.

```ts
import { css, getCSS } from "@spacefn/asteroids";

const tokens = css.tokens((t) => ({
	colors: {
		gray: { 50: "#f8fafc", 900: "#0f172a" },
		primary: t.colors.blue[600],
	},
	spacing: { sm: "0.5rem", md: "1rem" },
}));

const stylesheet = getCSS({ tokens, styles: [] });
```

### Variants

Define variant combinations and defaults:

```ts
const button = css
	.id("button")
	.variants({
		size: { sm: {}, lg: {} },
		tone: { primary: {}, danger: {} },
	})
	.defaults({ size: "sm", tone: "primary" })
	.style((variant) => ({
		base: { borderRadius: "0.375rem" },
		label: { fontWeight: variant.tone === "danger" ? "700" : "500" },
	}));

// button.base → default variant class
// button.variant({ size: "lg", tone: "danger" }) → explicit variant class
```

### HTML integration

```ts
import { h } from "@spacefn/asteroids";
import { getCSS } from "@spacefn/asteroids";
import { button, card } from "./styles";

const stylesheet = getCSS({ styles: [button, card] });

h.html(
	{},
	h.head({}, h.style({}, stylesheet)),
	h.body({}, h.button({ class: button.base }, "Click me")),
);
```

### Transitions

```ts
import { transition, transitionAll } from "@spacefn/asteroids";

transition("all", { duration: "200ms", easing: "ease-in-out" });
// transition: all 200ms ease-in-out
```

---

## DataStar

Typed helpers for DataStar attributes, fetch expressions, and server-sent events.

### Attributes

DataStar helpers return attribute objects. Use `h.attrs()` to merge them with your own attributes:

```ts
import { h, ds } from "@spacefn/asteroids";

h.button(
	h.attrs(
		ds.dataSignal("count", "0"),
		ds.dataOn("click", "@get('/api/count')"),
		ds.dataText("count"),
		{ class: "btn btn-primary" },
	),
	"Increment",
);
```

Or import individual helpers:

```ts
import { dataSignal, dataOn, dataText } from "@spacefn/asteroids";

h.button(h.attrs(dataSignal("count", "0"), dataOn("click", "$count++"), { class: "btn" }), "Click");
```

### Available helpers

| Helper                     | Purpose                |
| -------------------------- | ---------------------- |
| `dataSignal(name, expr)`   | Initialize a signal    |
| `dataText(expr)`           | Bind text content      |
| `dataBind(attr, expr?)`    | Bind an attribute      |
| `dataComputed(name, expr)` | Computed signal        |
| `dataShow(expr)`           | Conditional visibility |
| `dataClass(name, expr)`    | Toggle CSS class       |
| `dataOn(event, expr)`      | Event listener         |
| `dataIndicator(signal)`    | Loading indicator      |
| `dataEffect(expr)`         | Side effect            |
| `dataRef(name)`            | Element reference      |

### Fetch expressions

```ts
import { get, post, put, patch, del } from "@spacefn/asteroids";

ds.dataOn("click", get("/api/users"));
ds.dataOn("submit", post("/api/users", { indicator: "saving" }));
ds.dataOn("click", del("/api/users/1"));
```

### Server-sent events

```ts
import { patchElements, patchSignals } from "@spacefn/asteroids";

export async function GET() {
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(patchElements("#status", "<p>Ready</p>"));
			controller.enqueue(patchSignals({ count: 1 }));
			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
		},
	});
}
```

Available SSE helpers: `patchElements`, `patchSignals`, `removeElements`, `removeSignals`, `executeScript`, `autoResponse`.

---

## Database

Schema definitions, type generation, migrations, and schema hashing for SQLite (Cloudflare D1 / Workers).

### Define schema

```ts
import { defineSchema, column } from "@spacefn/asteroids";

const schema = defineSchema({
	users: {
		id: column.integer().primaryKey().autoIncrement(),
		email: column.text().notNull().unique(),
		name: column.text(),
		createdAt: column.text().default("CURRENT_TIMESTAMP"),
	},
	posts: {
		id: column.integer().primaryKey().autoIncrement(),
		title: column.text().notNull(),
		body: column.text(),
		userId: column.integer().references("users.id"),
	},
});
```

### Column types

| Type               | SQLite  | TypeScript    |
| ------------------ | ------- | ------------- |
| `column.text()`    | TEXT    | `string`      |
| `column.integer()` | INTEGER | `number`      |
| `column.real()`    | REAL    | `number`      |
| `column.blob()`    | BLOB    | `ArrayBuffer` |
| `column.json()`    | TEXT    | `string`      |

### Column modifiers

Chain modifiers in any order:

```ts
column.text().notNull().unique().default("hello").index();
column.integer().primaryKey().autoIncrement();
column.integer().references("users.id");
```

### Generate types

Generate Kysely-compatible TypeScript types from your schema:

```ts
import { generateTypes, defineSchema, column } from "@spacefn/asteroids";

const schema = defineSchema({
	users: {
		id: column.integer().primaryKey().autoIncrement(),
		email: column.text().notNull().unique(),
	},
});

const types = generateTypes(schema);
// Produces: export type Users = { id: Generated<number>; email: string }
//           export type UsersSelect = Selectable<Users>
//           export type UsersInsert = Insertable<Users>
//           export type Database = { users: Users }
```

### Generate migrations

Generate Kysely-compatible migration files:

```ts
import { generateMigration, generateIncrementalMigration } from "@spacefn/asteroids";

// Full migration (creates all tables)
const full = generateMigration(schema, "001_init");

// Incremental migration (only diffs)
const diff = generateIncrementalMigration(oldSchema, newSchema, "002_add_posts");
```

### Run migrations

```ts
import { migrate, migrateDown, migrateStatus } from "@spacefn/asteroids";

// Apply all pending migrations
await migrate(db, [migration1, migration2]);

// Rollback last migration
await migrateDown(db, [migration1, migration2], 1);

// Check status
const { applied, pending } = await migrateStatus(db, [migration1, migration2]);
```

### Schema hashing

Detect schema changes for incremental migration generation:

```ts
import { computeSchemaHash, hasSchemaChanged } from "@spacefn/asteroids";

const hash = computeSchemaHash(schemaContent);
const changed = hasSchemaChanged(projectRoot, schemaContent);
```

---

## Hono utilities

Typed helpers for Hono route handlers, loaders, actions, and pages.

```ts
import {
	defineRoute,
	defineLoader,
	defineActions,
	definePage,
	html,
} from "@spacefn/asteroids/hono";
```

### defineRoute

Typed route handler — returns the function as-is with proper types:

```ts
import { Hono } from "hono";
import { defineRoute, html } from "@spacefn/asteroids/hono";
import { h } from "@spacefn/asteroids";

const app = new Hono();

app.get(
	"/users/:id",
	defineRoute((c) => {
		const id = c.req.param("id");
		return html(h.div({}, `User ${id}`));
	}),
);
```

### defineLoader

Typed data loader for pages:

```ts
export const loader = defineLoader(async (c) => {
	const user = await getUser(c.req.param("id"));
	return { user };
});
```

### defineActions

Action map with `_action` query parameter paths:

```ts
const actions = defineActions({
	save: {
		method: "post",
		resolver: async (c) => {
			const data = await c.req.json();
			await saveUser(data);
			return html(h.p({}, "Saved!"));
		},
	},
	delete: {
		method: "post",
		resolver: async (c) => {
			await deleteUser(c.req.param("id"));
			return html(h.p({}, "Deleted!"));
		},
	},
});

// actions.save.path → "?_action=save"
// actions.delete.path → "?_action=delete"
```

### definePage

Typed page component that receives loader data:

```ts
export default definePage((data: { user: { name: string } }) => {
	return h.html({}, h.body({}, h.h1({}, data.user.name)));
});
```

### html response helper

Render an `HtmlElement` to a `Response`:

```ts
import { html } from "@spacefn/asteroids/hono";
import { h } from "@spacefn/asteroids";

// Returns Response with Content-Type: text/html
return html(h.div({}, "Hello"));
```

---

## Vite plugin

Code generators for API routes, pages, and database schemas. Watches source files and regenerates on change during dev.

```ts
import { generators, apiGenerator, pageGenerator, dbGenerator } from "@spacefn/asteroids/vite";
```

### Setup

```ts
import { defineConfig } from "vite";
import { generators } from "@spacefn/asteroids/vite";

export default defineConfig({
	plugins: [generators(apiGenerator(), pageGenerator(), dbGenerator())],
});
```

Or use the combined `generators()` with no args for all defaults:

```ts
plugins: [generators(apiGenerator(), pageGenerator(), dbGenerator())];
```

### API generator

Watches `src/api/**/*.ts` and generates `.space/api.ts` with Hono route registrations.

```
src/api/users.ts      → GET/POST /users
src/api/users.get.ts  → GET /users
src/api/users.post.ts → POST /users
```

### Page generator

Watches `src/pages/**/*.ts` and generates `.space/pages.ts` with Hono page routes (loader + actions).

### DB generator

Watches `src/**/*.schema.ts` and generates `.space/db.ts` with type definitions.

### Custom generator

Create your own generator:

```ts
import { generators, type Generator } from "@spacefn/asteroids/vite";

const myGenerator: Generator = {
	watch: "src/locales/**/*.json",
	output: ".space/i18n.ts",
	generate(files) {
		// files = absolute paths matching the glob
		return `export const locales = ${JSON.stringify(files)};`;
	},
};

plugins: [generators(myGenerator)];
```

Generators run at build start and re-run on file changes during dev with 100ms debounce.
