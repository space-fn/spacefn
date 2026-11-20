<p align="center"><img src="packages/docs/content/logo.svg" alt="spacefn" width="96" /></p>

# spacefn

Full-stack TypeScript apps from folders of convention files, on [Effect](https://effect.website). Write pages, routes, SQL and jobs in `app/`; spacefn generates the wiring, and the `space` CLI runs, builds and deploys it, to **Cloudflare Workers** or to **Bun** in Docker.

```sh
npm create spacefn@latest my-app
cd my-app && cp .env.example .env && npm install && npm run dev
```

```txt
app/pages/          server-rendered pages, with form actions and live updates (Datastar)
app/routes/         HTTP endpoints
app/middleware/     runs around every request
app/db/<name>/      migrations/ and queries/ in SQL, typed for you
app/queues/         queue consumers
app/crons/          scheduled jobs
app/env.ts          the variables the app reads
configs/            space.ts, and optional vite.config.ts and infra.ts
```

Read the [docs](packages/docs/content/index.md), starting with [Getting started](packages/docs/content/getting-started.md).

## Packages

| Package          | What it is                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `spacefn`        | Everything an app installs: the framework, both targets, the Vite plugin, the stacks, the CLI |
| `spacefn-docs`   | spacefn's docs and the reader `space docs` shows them with, a dev dependency of every app     |
| `create-spacefn` | `npm create spacefn`                                                                          |
| `vscode-spacefn` | VS Code: SQL checked against migrations, Datastar and CSS in templates                        |

Inside `packages/spacefn/src/`, each area is a folder, and `test/boundaries.test.ts` keeps them apart:

| Folder        | Import                                             | What it is                                                       |
| ------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| (the rest)    | `spacefn`, …                                       | The core: routes, pages, database, services, jobs, auth, codegen |
| `sql/`        | `spacefn/sql`                                      | Parses and checks migrations and queries, with no dependencies   |
| `cloudflare/` | `spacefn/cloudflare`                               | Runs an app as a Worker                                          |
| `bun/`        | `spacefn/bun`                                      | Runs an app on Bun: web, queue and cron processes                |
| `infra/`      | `spacefn/vite`, `spacefn/infra/*`, the `space` bin | The CLI, the Vite plugin and the Alchemy stacks                  |

The core never imports a target or the infra. The targets and the infra import the core by its package name (`spacefn/runtime`), not by relative path, so a build shares one copy of it.

## Working on spacefn

```sh
pnpm install
pnpm check        # format, lint, typecheck
pnpm test
```

`playground/cloudflare` and `playground/bun` are apps made from the `create-spacefn` template on the workspace packages: `cd playground/bun && pnpm dev`. After changing the template, `pnpm playground` remakes them (a test fails until you do). Set `SPACE_TEST_DOCKER=1` to include the test that deploys to local Docker.

Config for the repo's tools lives in `configs/`. Commits follow conventional commits.

The docs are in `packages/docs/content/`. `cd playground/bun && pnpm docs` shows them as you write them, and their edit links open the files in your editor.

`pnpm pack:check` packs `spacefn`, `spacefn-docs` and `create-spacefn`, scaffolds an app per target outside the workspace, installs the tarballs with npm, and typechecks, tests and (on Bun) builds and serves it. `pnpm run publish` runs it before publishing the three at one version.

## License

Apache-2.0
