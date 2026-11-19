<p align="center"><img src="docs/logo.svg" alt="spacefn" width="96" /></p>

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

Read the [docs](docs/index.md), starting with [Getting started](docs/getting-started.md).

## Packages

| Package               | What it is                                                             |
| --------------------- | ---------------------------------------------------------------------- |
| `spacefn`             | The framework: routes, pages, database, services, jobs, auth, testing  |
| `@spacefn/cloudflare` | Runs an app as a Worker                                                |
| `@spacefn/bun`        | Runs an app on Bun: web, queue and cron processes                      |
| `@spacefn/infra`      | The `space` CLI, the Vite plugin and the Alchemy stacks                |
| `@spacefn/sql`        | Parses and checks migrations and queries                               |
| `create-spacefn`      | `npm create spacefn`                                                   |
| `vscode-spacefn`      | VS Code: SQL checked against migrations, Datastar and CSS in templates |

## Working on spacefn

```sh
pnpm install
pnpm check        # format, lint, typecheck
pnpm test
```

`playground/cloudflare` and `playground/bun` are apps made from the `create-spacefn` template on the workspace packages: `cd playground/bun && pnpm dev`. After changing the template, `pnpm playground` remakes them (a test fails until you do). Set `SPACE_TEST_DOCKER=1` to include the test that deploys to local Docker.

Config for the repo's tools lives in `configs/`. Commits follow conventional commits.

## License

Apache-2.0
