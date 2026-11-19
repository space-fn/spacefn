# Effect rewrite plan

Working notes for the `rewrite/effect` branch. This folder is deleted in step 16.

The old code is in `legacy/spacefn` and `legacy/playground`, outside the pnpm workspace and skipped by lint, format and tests. Port from there: bring over the tests and pure logic, and leave the rest.

**Rule:** the core (`spacefn`) never imports a runtime. Cloudflare, Bun and Alchemy each live in their own package, and the core sees only Effect service interfaces. A guard test enforces this.

## End-user app layout

```txt
my-app/
├── package.json
├── tsconfig.json                # { "extends": "./configs/tsconfig.json" }
├── .gitignore                   # also covers generated folders, so lint/fmt skip them
├── configs/
│   ├── space.ts                 # defineSpace: target, db drivers, aliases, auth/tenancy
│   ├── infra.ts                 # Alchemy extras: stages, domains, extra resources
│   ├── vite.config.ts           # optional: user Vite plugins (Tailwind, React, ...)
│   ├── tsconfig.json  oxlint.json  oxfmt.json  vitest.config.ts
│   └── docker/Dockerfile        # Bun target only (`space add docker`)
├── app/  env.ts layers.ts middleware/ routes/ pages/ client/ db/<name>/ queues/ crons/
│         durable-objects/ workflows/            # last two: Cloudflare only
├── modules/  lib/  utils/  docs/spacefn/
└── .space/                      # generated, gitignored: entry, router, db, vite.config.ts, alchemy.run.ts, .alchemy/, dist/
```

## Packages

| Package               | Contents                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@spacefn/sql`        | SQL parser, splitting, inference. No Effect. Used by the core and the VS Code extension.                                                                                                                                                |
| `spacefn`             | Conventions, codegen (`spacefn/codegen`, Node-only), HTTP, pages, Datastar, db runtime, auth, tenancy, tracing, service interfaces, in-memory Layers, testing, and fetch-only adapters (libSQL via `@libsql/client/web`, S3, Kv on SQL) |
| `@spacefn/cloudflare` | Worker entry, D1, DO SQLite, R2, KV, Queues, crons, DOs, Workflows, Bus relay                                                                                                                                                           |
| `@spacefn/bun`        | Bun server entry, PubSub Bus, in-process queues and crons                                                                                                                                                                               |
| `@spacefn/infra`      | The only package that imports `alchemy` or `vite`: the `space` CLI, the spacefn Vite plugin (`@spacefn/infra/vite`), turns conventions into resources, runs dev, build and deploy                                                       |

## Steps

Each step ends with `pnpm check` and `pnpm test` passing, in small conventional commits. Work stops after each step for review.

- [x] **0. Repo tooling:** oxlint, oxfmt, vitest, tsdown and tsc from `configs/`; hooks via `core.hooksPath`; CI.
- [x] **1. Alchemy spike:** see [alchemy-spike.md](alchemy-spike.md).
- [x] **1b. Vite spike:** Vite is the only build system for apps on both targets; see [vite-spike.md](vite-spike.md).
- [x] **2. Package skeletons and the dependency guard test:** `packages/spacefn/test/boundaries.test.ts` checks dependency fields and `src/` imports for every package. Core runtime files may not use `node:*`; only `src/cli*` and `src/codegen/` may.
- [x] **3. `@spacefn/sql`:** the root export is pure (split, params, query and migration files, `inferQuery`, `analyzeQuery`); `@spacefn/sql/node` has `scratchDatabase` (`node:sqlite`), `scanMigrations` and `scanQueries`. The VS Code extension uses it. Postgres/PGlite is dropped, since every driver is SQLite.
- [x] **4. Core foundations:** tagged HTTP errors + `httpStatus`, `SpaceError`; `defineEnv` with `Env.string|number|int|boolean|url|secret|schema` over Effect `Config`; `defineSpace` (`spacefn/config`) and the Node loader in `src/codegen/`; `Kv`, `Blob`, `Bus`, `Queue` services with `.memory` Layers; `spacefn/testing` (`memoryServices`, `testEnv`, `QueueInbox`). The SQL test Layer moves to step 7 with the migration runner.
- [x] **5. Scanner and codegen (`space gen`):** `spacefn/codegen` runs scan (Node, `app/` into plain data) → plan (pure Effect, all checks) → render (pure) → write (only changed files, stale generated files removed). It never imports user files, so aliases can't break it. Generated: `manifest.ts` (typed by `SpaceManifest`, modules still `unknown`), `db/<name>.ts` (migrations, query parts, Params/Row types), the target entry, `vite.config.ts` and `tsconfig.json` (alias `paths`). Checks: route conflicts (by shape), names, client entries, Cloudflare-only folders and drivers, unknown db names, `@param` types, `.space/` in `.gitignore`. `watchGen` is a debounced Stream that survives failures. `space gen [--watch] [--prod]` lives in `@spacefn/infra`.
- [x] **6. HTTP:** `export default route({ GET: Effect, POST: Effect })`; handlers read input with `Input.params(schema)` (404 when it doesn't decode), `Input.query(schema)` and `Input.body(schema, limits)` (JSON, URL-encoded, multipart via web `formData()` so it runs on Workers; streamed size limit, file count/size, magic-byte types; `Upload` schema). A handler's value becomes text/JSON/204; tagged errors map to status + JSON; anything else is a logged, opaque 500; unhandled methods are 405 with `Allow`; unknown paths are a JSON 404. `export default middleware((next) => ...)` files run in name order, first outermost. `csrf()` is a middleware the app opts into. `httpLayer(manifest, services)` (in `spacefn/runtime`) builds services once for routes and middleware; `testHttp` in `spacefn/testing`. The manifest types make a wrong default export a type error.
- [ ] **7. Database:** migration runner on `SqlClient` (ledger, checksums, up/down, race retry), Schema-decoded typed queries, `space db doctor|migrate`.
- [ ] **8. Pages and realtime:** one file per page, `export default definePage({ loader, actions, render })`. `loader` is an Effect (reads `Input.*`, uses services, fails with tagged errors); each action is `{ input: Schema, handler }` and returns data (`ctx.actionData`) or redirects, re-rendering with issues on a decode failure; `render(ctx)` gets typed `loaderData`, `actionData`, `params` and `ctx.actions.<name>` (`.url` = `?__action=<name>`, `.method`) for forms and Datastar. Keep `loader` before `render` so inference flows; fall back to a chained builder if it proves fragile. HTML builder, Datastar SSE as a `Stream`, Bus interface with an in-memory Layer.
- [ ] **9. Auth, tenancy, tracing (OTLP).**
- [ ] **10. `@spacefn/cloudflare`:** export `worker(manifest)`, the entry `.space/entry.ts` calls. Durable Object and workflow files default-export their class.
- [ ] **11. `@spacefn/bun`:** export `app(manifest)` (the fetch handler `.space/app.ts` builds, for dev and prod) and `serve(app)` (`.space/server.ts`: `Bun.serve` plus `dist/client`).
- [ ] **12. `@spacefn/infra`:** the spacefn Vite plugin (root override, outDirs, watcher ignores, `virtual:space/assets`, client-first build, server-edit reload, Bun dev middleware); generate `.space/alchemy.run.ts` with `Cloudflare.Website.Vite`; merge `configs/infra.ts`; Docker image from `vite build` output; `space add docker`.
- [ ] **13. CLI (`effect/cli`, in `@spacefn/infra`):** dev (`alchemy dev` for Cloudflare, Vite inside Bun for Bun), build (`vite build`), gen, deploy, destroy, db, doctor, upgrade, clean.
- [ ] **14. VS Code extension:** read `configs/space.ts` and the new imports; tests on vitest.
- [ ] **15. Template, playground, docs.**
- [ ] **16. Finish:** delete `legacy/`, `scripts/size.sh` (it still points at the old playground) and this folder, bump to `0.11.0`, merge to `main`.

## Conventions

- Workspace `exports` point at `src/*.ts`, so tests, esbuild and tsc need no build step. `publishConfig.exports` swaps in `dist/` when packing.
- Pure packages throw plain error classes with stable codes (`SqlError.code`). Effect-tagged errors start in the core.

- Relative imports end in `.ts` (`allowImportingTsExtensions`, `erasableSyntaxOnly`), so plain Node can run workspace source with type stripping. The CLI depends on this to load `configs/space.ts`.
- Services are `Context.Service` classes with tagged errors and a static `.memory` Layer. Target packages add `.cloudflare` / `.bun` Layers beside them.
- `Bus.subscribe` is scoped and the subscription is open once it returns, so subscribe → render → stream never drops an update.

## Corrections found along the way

- The CLI moved from the core to `@spacefn/infra` (step 5): it needs `@effect/platform-node`, which the core must not depend on, and every command but `gen` needs Alchemy or Vite anyway.
- Use `Schema.FiniteFromString` for numeric params: Effect 4's `NumberFromString` decodes `"abc"` to `NaN`.
- Route handlers don't see context provided by global router middleware, so `httpLayer` builds the services once and gives the same context to both (`provideRequest` for routes, `provideContext` in the middleware).
- `pnpm check` doesn't build; run `pnpm -r build` too (a stale tsdown entry slipped through once).
- Route params must be identifiers (`[userId]`, not `[user-id]`): the router treats `-` inside a segment as a separator.

- Effect 4.1.4 has HTTP, SQL and CLI as stable modules: `effect/http`, `effect/sql`, `effect/cli`. They are not under `effect/unstable/*`.
- Effect 4: a service class is not an Effect (`yield*` it inside `Effect.gen`), `Stream.runCollect` returns an array, `Schema.Defect()` is a function, and `Schema.Record` does not reject keys that fail the key schema (use a `makeFilter` check).
- oxlint and oxfmt resolve `ignorePatterns` relative to the config file, and reject `..`. Extra ignores must be CLI flags (`--ignore-pattern`, `'!glob'`). Both tools honor the root `.gitignore`.
