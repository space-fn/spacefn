# Notes for coding agents

This is a spacefn app. spacefn is built on Effect 4: handlers, loaders and jobs are `Effect`s, services are read with `yield*` inside `Effect.gen`.

- Convention folders are listed in README.md. Adding, removing or renaming a file there needs `npx space gen` (`npm run dev` does it on its own).
- `.space/` is generated. Never edit it; change `app/` or `configs/` instead.
- Database: write migrations in `app/db/<name>/migrations/NNNN_name.sql` (`-- up` and `-- down` sections) and one query per file in `app/db/<name>/queries/` (`-- name: listTodos :many`, `:one` or `:exec`, `:param` placeholders, `-- @column name type` for expressions). Use them with `const db = yield* MainDb` from `@space/db/<name>.ts`.
- Pages: `export default page({ loader, actions, render })`; actions are `action({ method?, input: Schema, handler })`. Routes: `export default route({ GET: Effect, POST: Effect })`.
- Errors: fail with `NotFound`, `BadRequest`, `Unauthorized`, ... from spacefn; they become the right status.
- `app/env.ts` is imported by deploys, so it may import only `spacefn` and `effect`.
- spacefn's docs, for the installed version, are Markdown files in `node_modules/@spacefn/docs/content/`. Read them before guessing an API.
- Check your work with `npm run typecheck` and `npm test`; `npx space doctor` explains setup problems.
