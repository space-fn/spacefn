<p align="center"><img src="packages/docs/content/logo.svg" alt="spacefn" width="96" /></p>

# spacefn

Full-stack TypeScript apps from folders of convention files, on [Effect](https://effect.website). Write pages, routes, SQL and jobs in `app/`; spacefn generates the wiring, and the `space` CLI runs, builds and deploys it, to **Cloudflare Workers** or to **Bun** in Docker.

```sh
npm create spacefn@latest my-app
cd my-app && cp .env.example .env && npm install && npm run dev
```

```txt
app/entry.ts        the app's services, middleware and error handling, in one file
app/routes/         pages and HTTP endpoints, and _middleware.ts around them
app/db/<name>/      config.json, migrations/ and queries/ in SQL, typed for you
app/queues/         queue consumers
app/crons/          scheduled jobs
configs/            env.ts (the variables the app reads), vite.ts (with the target), vitest.ts, optional infra.ts
```

Read the [docs](packages/docs/content/index.md), starting with [Getting started](packages/docs/content/getting-started.md).

## Packages

| Package          | What it is                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `spacefn`        | Everything an app installs: the framework, both targets, the Vite plugin, the CLI         |
| `spacefn-docs`   | spacefn's docs and the reader `space docs` shows them with, a dev dependency of every app |
| `create-spacefn` | `npm create spacefn`                                                                      |
| `vscode-spacefn` | VS Code: SQL checked against migrations, Datastar and CSS in templates                    |

Inside `packages/spacefn/src/`, each area is a folder, and `test/boundaries.test.ts` keeps them apart:

| Folder        | Import                                           | What it is                                                        |
| ------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| (the rest)    | `spacefn`, …                                     | The core: routes, pages, database, services, jobs, auth, codegen  |
| `sql/`        | `spacefn/internal/sql`                           | Parses and checks migrations and queries, with no dependencies    |
| `cloudflare/` | `spacefn/cloudflare`                             | Runs an app as a Worker                                           |
| `bun/`        | `spacefn/bun`                                    | Runs an app on Bun: web, queue and cron processes                 |
| `infra/`      | `spacefn/vite`, `spacefn/infra`, the `space` bin | The CLI, the Vite plugin and `variables()` for `configs/infra.ts` |

The core never imports a target or the infra. The targets and the infra import the core by its package name (`spacefn/internal/runtime`), not by relative path, so a build shares one copy of it.

## Working on spacefn

```sh
pnpm install
pnpm check        # format, lint, typecheck
pnpm test
```

`examples/` holds apps on the workspace packages. `examples/starter-cloudflare` and `examples/starter-bun` are made from the `create-spacefn` template: `cd examples/starter-bun && pnpm dev`. After changing the template, `pnpm examples` remakes them (a test fails until you do). Set `SPACE_TEST_DOCKER=1` to include the test that deploys to local Docker.

Config for the repo's tools lives in `configs/`. Commits follow conventional commits.

The docs are in `packages/docs/content/`. `cd examples/starter-bun && pnpm docs` shows them as you write them, and their edit links open the files in your editor.

`pnpm pack:check` packs `spacefn`, `spacefn-docs` and `create-spacefn`, scaffolds an app per target outside the workspace, installs the tarballs with npm, and typechecks, tests and (on Bun) builds and serves it. `pnpm run publish` runs it before publishing the three at one version.

## License

Apache-2.0
