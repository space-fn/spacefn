# Effect rewrite plan

Working notes for the `rewrite/effect` branch. This folder is deleted in step 16.

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
│   ├── tsconfig.json  oxlint.json  oxfmt.json  vitest.config.ts
│   └── docker/Dockerfile        # Bun target only (`space add docker`)
├── app/  env.ts layers.ts middleware/ routes/ pages/ client/ db/<name>/ queues/ crons/
│         durable-objects/ workflows/            # last two: Cloudflare only
├── modules/  lib/  utils/  docs/spacefn/
└── .space/                      # generated, gitignored: entry, router, db, alchemy.run.ts, .alchemy/
```

## Packages

| Package               | Contents                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@spacefn/sql`        | SQL parser, splitting, inference. No Effect. Used by the core and the VS Code extension.                                                                                                                      |
| `spacefn`             | Conventions, codegen, CLI, HTTP, pages, Datastar, db runtime, auth, tenancy, tracing, service interfaces, in-memory Layers, testing, and fetch-only adapters (libSQL via `@libsql/client/web`, S3, Kv on SQL) |
| `@spacefn/cloudflare` | Worker entry, D1, DO SQLite, R2, KV, Queues, crons, DOs, Workflows, Bus relay                                                                                                                                 |
| `@spacefn/bun`        | Bun server entry, PubSub Bus, in-process queues and crons                                                                                                                                                     |
| `@spacefn/infra`      | The only package that imports `alchemy`: turns conventions into resources, runs dev and deploy                                                                                                                |

## Steps

Each step ends with `pnpm check` and `pnpm test` passing, in small conventional commits. Work stops after each step for review.

- [x] **0. Repo tooling:** oxlint, oxfmt, vitest, tsdown and tsc from `configs/`; hooks via `core.hooksPath`; CI.
- [x] **1. Alchemy spike:** see [alchemy-spike.md](alchemy-spike.md).
- [ ] **2. Package skeletons and the dependency guard test.**
- [ ] **3. `@spacefn/sql`:** port the parser, split, params and infer code with its tests; point the VS Code extension at it.
- [ ] **4. Core foundations:** tagged errors and HTTP mapping, env via `Config`/Schema, the `configs/space.ts` loader, service interfaces (`SqlClient` from `effect/sql`, Blob, Kv, Bus, Queue), in-memory Layers, `spacefn/testing`.
- [ ] **5. Scanner and codegen (`space gen`):** router, middleware chain, db modules, queue and cron tables, DO and workflow exports, target entry; watch mode; target checks.
- [ ] **6. HTTP:** `route()` and `middleware()` on `effect/http` `HttpRouter`; Schema params, query and body; multipart parsing with limits; CSRF; typed error mapping.
- [ ] **7. Database:** migration runner on `SqlClient` (ledger, checksums, up/down, race retry), Schema-decoded typed queries, `space db doctor|migrate`.
- [ ] **8. Pages and realtime:** HTML builder, loaders and actions, Datastar SSE as a `Stream`, Bus interface with an in-memory Layer.
- [ ] **9. Auth, tenancy, tracing (OTLP).**
- [ ] **10. `@spacefn/cloudflare`.**
- [ ] **11. `@spacefn/bun`.**
- [ ] **12. `@spacefn/infra`:** generate `.space/alchemy.run.ts`, merge `configs/infra.ts`, bundle the client with rolldown, Docker image, `space add docker`.
- [ ] **13. CLI (`effect/cli`):** dev, build, gen, deploy, destroy, db, doctor, upgrade, clean.
- [ ] **14. VS Code extension:** read `configs/space.ts` and the new imports; tests on vitest.
- [ ] **15. Template, playground, docs.**
- [ ] **16. Finish:** delete the old code and this folder, bump to `0.11.0`, merge to `main`.

## Corrections found along the way

- Effect 4.1.4 has HTTP, SQL and CLI as stable modules: `effect/http`, `effect/sql`, `effect/cli`. They are not under `effect/unstable/*`.
- oxlint and oxfmt resolve `ignorePatterns` relative to the config file, and reject `..`. Extra ignores must be CLI flags (`--ignore-pattern`, `'!glob'`). Both tools honor the root `.gitignore`.
