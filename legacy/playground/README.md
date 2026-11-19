# Playground

A demo app for developing spacefn itself. It is not a starter: run `npm create spacefn my-app` for that.

## Demo-only routes

`app/routes/todos.ts`, `app/routes/todos/[id].ts` and `app/routes/notify.ts` are open on purpose, to keep the demo small. They have no authentication and no per-user scoping. Do not copy them into a real app without adding both.

The `auth/` routes are the safe ones to learn from: they sign sessions in and out, and `app/middleware/03-session.ts` resolves them on every request.
