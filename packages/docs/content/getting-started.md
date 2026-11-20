# Getting started

## Create an app

```sh
npm create spacefn@latest my-app
```

It asks where the app runs: **Cloudflare** (Workers, D1, KV, R2, Queues, Durable Objects) or **Bun** (one Docker container, with local SQLite files or a remote libSQL database). Pass `--target cloudflare` or `--target bun` to skip the question. You can change it later in `configs/space.ts`.

```sh
cd my-app
cp .env.example .env
npm install        # also runs `space gen`
npm run dev
```

The new app is a small todo list: one page with a form, a SQLite table, and a list that updates live in every open tab. Open the URL `npm run dev` prints.

You need Node 22 or later. A Bun app also needs [Bun](https://bun.sh), and Docker to deploy. If something doesn't start, run `npx space doctor`: it checks all of this and says what to install.

## What's in it

```txt
app/
  pages/index.ts            the page at /
  pages/_layout.ts          the HTML around every page (private: no page of its own)
  pages/index.test.ts       its test
  routes/health.ts          GET /health
  middleware/1-csrf.ts      refuses cross-site form posts
  db/main/migrations/       the schema, in SQL
  db/main/queries/          one SQL query per file, typed for you
  client/site.css           bundled by Vite
  env.ts                    the variables the app reads
configs/
  space.ts                  the target and options
  tsconfig.json, vitest.config.ts
.space/                     generated; don't edit or commit it
```

Add a file to `app/pages/` and it is a page; add one to `app/db/main/queries/` and `db.yourQuery()` exists. `npm run dev` regenerates `.space/` as you go. See [Conventions](conventions.md).

## Change something

Add a query, `app/db/main/queries/clear-done.sql`:

```sql
-- name: clearDone :exec
DELETE FROM todos WHERE done = 1;
```

Then an action on the page that uses it, in `app/pages/index.ts`:

```ts
clearDone: action({
	input: Schema.Struct({}),
	handler: () =>
		Effect.gen(function* () {
			yield* (yield* MainDb).clearDone();
			return yield* changed;
		}),
}),
```

and a button for it in `render`:

```ts
html`<form method="post" action="${ctx.actions.clearDone.url}"><button>Clear done</button></form>`;
```

The editor knows `clearDone` exists because `space gen` typed it from the SQL.

## Test and deploy

```sh
npm test           # the tests next to your code
npm run deploy     # stage `prod`
```

On Cloudflare, `deploy` creates the D1 database, the queues and the rest in your account; Alchemy asks you to sign in the first time. On Bun it builds an image and runs it in Docker, locally or on a server you name in `configs/infra.ts`. See [Deploying](deploy.md).
