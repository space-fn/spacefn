---
icon: bulb
---

# Best practices

How to keep a spacefn app easy to change as it grows. None of this is enforced; it's how the docs, the new app and the examples are written, so following it means every example applies to your app as is.

## Keep `app/` to wiring

A file in `app/` connects code to a URL, a queue or a schedule. It reads input, calls a module, and passes the result to a view. When a route or page file grows logic of its own, move that logic into the feature's module.

```ts [app/routes/todos/[id].ts]
// Good: the route says what's connected, the module does the work.
export default route({ GET: Effect.flatMap(id, Todos.find) });
```

## One folder per feature

Put everything about a feature in `modules/<feature>/`: its logic, views, styles, browser code and tests. Deleting the folder (and the `app/` files that point at it) removes the feature. Shared code goes in `lib/`, which never imports `modules/`, so imports run one way: `app/` → `modules/` → `lib/`.

When two features need the same thing, move it to `lib/` instead of importing one feature from the other in both directions.

## Name what the feature does

Export functions named for the domain, not for HTTP: `Todos.add`, `Orders.refund`, `Sessions.deleteExpired`. Then a page action, a route, a queue consumer and a cron can all call the same one, and the name still fits.

## Views take props

A view is a function from plain props to `html`. Pass it what it shows and the URLs it posts to, never the page's `ctx`:

```ts
todosPage({ todos: ctx.data.todos, add: ctx.actions.add.url });
```

It can then be tested alone, reused by another page, and rendered again by a live update. Give an element that Datastar patches a fixed `id`, exported beside its view.

## Decode at the edge

Read every input through a Schema: `Input.params`, `Input.query`, `Input.body`, an action's `input`, a queue's `body`. Inside the module, values are already the right type, so the code doesn't check them again. Keep the schema in the module, next to the function that takes it (`Todos.NewTodo`), and let the `app/` file reference it.

## Fail with typed errors

Fail with spacefn's errors (`NotFound`, `Forbidden`, `Conflict`, ...) for what a client should see, and your own tagged errors for the rest. Don't throw: an exception is a defect, logged and answered with an opaque `500`. Handle a failure where you can do something about it, with `Effect.catchTag`.

## Keep SQL in files

One query per file in `app/db/<name>/queries/`, so `space gen` types and checks it against the schema. Reach for `` sql`...` `` only when a query really is dynamic. Migrations only move forward: never edit one that has run, add the next.

## Make jobs safe to repeat

Queue messages are delivered at least once, and a failed one is retried. Write handlers so running one twice does no harm: check whether the work is done, or use an `INSERT ... ON CONFLICT`. Crons run once per process on Bun, so run one cron process.

## Configure through `configs/env.ts`

Declare every variable the app reads, with its type, and read it with `yield* Env`. Don't read `process.env`: it isn't checked, and it doesn't exist the same way on every target. Mark keys and tokens `Env.secret()`, so they stay out of logs and become secrets on deploy.

## Load only what a page uses

Every page loads the layout's entries; a page that needs more passes its own with `assets(...)`. A framework island loads its own script, and only on the pages that render it, so pages without it stay light. Prefer server-rendered HTML with Datastar for interactivity, and use a framework island where a component really needs client state.

## Test through the app

Test a feature the way it's used: `testApp(manifest, services)` serves the real pages and routes in memory, and `fetch` drives them. Test a module's functions directly when the logic has cases a page can't easily reach. Keep each test next to the code it tests.

## Don't touch what's generated

`.space/` is rewritten from `app/` on every change. When something there looks wrong, the cause is in `app/` or `configs/`, and `space gen` names the file. Never commit it.
