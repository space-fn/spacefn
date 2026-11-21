# Getting started

## Create an app

```sh
npm create spacefn@latest my-app
```

It asks where the app runs: **Cloudflare** (Workers, D1, KV, R2, Queues, Durable Objects) or **Bun** (one Docker container, with local SQLite files or a remote libSQL database). Pass `--target cloudflare` or `--target bun` to skip the question. You can change it later: it's the `target` in `configs/vite.ts`.

```sh
cd my-app
cp .env.example .env
npm install        # also runs `space gen`
npm run dev
```

The new app is a small todo list: one page with a form, a SQLite table, and a list that updates live in every open tab. Open the URL `npm run dev` prints.

You need Node 22 or later. A Bun app also needs [Bun](https://bun.sh), and Docker to deploy. If something doesn't start, run `npx space doctor`: it checks all of this and says what to install.

## What's in it

`app/` holds what spacefn reads, and its files only connect the code in `modules/` and `lib/`:

```txt
app/
  entry.ts                  what runs with the rest: services, middleware, onError
  routes/index.ts           the page at /: the todos module's actions and views, wired up
  routes/health.ts          GET /health
  routes/_middleware.ts     refuses cross-site form posts, on every request
  db/main/migrations/       the schema, in SQL
  db/main/queries/          one SQL query per file, typed for you
  client/site.css           the stylesheet entry, loaded by assets("site")
modules/todos/
  todos.ts                  what the app does with todos: list, add, toggle
  views.ts                  the todos' HTML, from plain props
  todos.css                 their styles, imported by app/client/site.css
  todos.test.ts             the feature tested through the page, in memory
lib/ui/
  layout.ts                 the HTML around every page
  base.css                  the design tokens and base styles
public/favicon.svg          served as it is, at /favicon.svg
configs/
  env.ts                    the variables the app reads
  infra.ts                  what a deploy creates: a plain Alchemy stack
  vite.ts                   the Vite config, with spacefn's plugin and the target
  vitest.ts, tsconfig.json
  Dockerfile                the image a Bun deploy builds (Bun only)
.space/                     generated; don't edit or commit it
```

Add a file to `app/routes/` and it is a page or a route; add one to `app/db/main/queries/` and `MainDb.yourQuery()` exists. `npm run dev` regenerates `.space/` as you go. See [Conventions](conventions.md).

## Change something

Add a query, `app/db/main/queries/clear-done.sql`. Its file name makes it `clearDone`:

```sql
DELETE FROM todos WHERE done = 1;
```

Then what it means for the feature, in `modules/todos/todos.ts`:

```ts
/** Deletes the done todos, and tells every open page. */
export const clearDone = MainDb.clearDone().pipe(Effect.andThen(Bus.publish(TOPIC, "changed")));
```

Wire it to the page as an action, in `app/routes/index.ts`:

```ts
clearDone: action({
	input: Schema.Struct({}),
	handler: () => Effect.as(Todos.clearDone, redirect("/")),
}),
```

and give the view a button that posts to it: pass `clearDone: ctx.actions.clearDone.url` to `todosPage`, and in `modules/todos/views.ts`:

```ts
html`<form method="post" action="${props.clearDone}"><button>Clear done</button></form>`;
```

The editor knows `clearDone` exists because `space gen` typed it from the SQL.

## Test and deploy

```sh
npm test           # every *.test.ts in app/, modules/ and lib/
npm run deploy     # stage `prod`
```

`deploy` runs `configs/infra.ts`, a plain Alchemy stack. On Cloudflare it creates the D1 database, the queues and the rest in your account; Alchemy asks you to sign in the first time. On Bun it builds an image with `configs/Dockerfile` and runs it in Docker. See [Deploying](deploy.md).
