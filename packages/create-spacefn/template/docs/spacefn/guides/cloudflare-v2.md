# Cloudflare v2 foundation

Spike notes for building spacefn on `@cloudflare/vite-plugin@2.0.0-beta.v.1` and `cf@1.0.0-beta.18`. Both are pinned to exact versions because the beta format can change.

## Setup

| Piece         | Choice                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| Vite plugin   | `space()` from `spacefn/vite` returns the folder sync plugin plus the Cloudflare plugin |
| Worker config | Root `cloudflare.config.ts` using `defineConfig()` from `cf/config`                     |
| Builders      | `bindings`, `exports`, `triggers` are re-exported from `spacefn/cloudflare`             |
| `cf` CLI      | Comes with `spacefn` as a dependency. Apps do not install it.                           |
| Wrangler      | Not used                                                                                |

## Verified locally

All run under `vite dev` with local state in `.cloudflare/state/`.

| Runtime                      | Result                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Fetch routes                 | Works                                                                                       |
| SQLite Durable Object        | Works, state survives a dev restart                                                         |
| Queue producer and consumer  | Works, message delivered to `queue()`                                                       |
| Cron                         | Works, fires through the local explorer API (`/cdn-cgi/local/explorer/api/local/scheduled`) |
| Workflow                     | Works, two steps complete                                                                   |
| `vite build`                 | Writes `.cloudflare/output/v0/`                                                             |
| `cf deploy --dry-run`        | Lists the Durable Object binding, needs no login                                            |
| `cf-worker` import attribute | Loads at runtime                                                                            |

## Things to know

- `tsconfig.json` must include `.cloudflare/types` explicitly. TypeScript skips dot folders.
- The `cf-worker` import attribute needs `allowImportingTsExtensions` to typecheck. Not used yet.
- Durable Object lifecycle is declared in config, with no migration tags. Classes are `created`, `renamed`, `deleted` or `expectingTransfer`. Deleting a class means leaving a `deleted` entry behind, so folder inference alone cannot remove a class safely.
- `cf deploy` provisions resources whose ids are omitted, but does not write ids back.
- pnpm adds `minimumReleaseAgeExclude` entries for fresh beta packages in `pnpm-workspace.yaml`.
- The dev server prints a local explorer API with a `spans` and `logs` SQL endpoint. Worth using for local tracing later.

## Effect on the plan

- No generated `wrangler.jsonc`. Config is `cloudflare.config.ts`.

- Convention folders (`app/durable-objects/`, `app/workflows/`, `app/queues/`, `app/crons/`) are scanned by the `space()` Vite plugin, and their bindings/exports/triggers are injected into the Worker config at Vite config-resolution time — both `vp dev` and `vp build`. The deployed Worker (`.cloudflare/output/v0/workers/default/worker.config.json`) carries the same entries as local dev.
- Queues, crons, Durable Objects and Workflows map from folders to config entries. The generated worker entry must export the classes.
- Removed Durable Object classes need a user-declared `deleted` entry.
- `space dev` and `space build` wrap Vite. `space deploy` wraps `cf deploy`.

## Constraints found while building env

- **Config imports are unreadable to the Worker.** The plugin adds every file `cloudflare.config.ts` imports to Vite's `server.fs.deny`. If the Worker imports the same file, dev fails with `Failed to load url ... Does the file exist?`. So `env.ts` must not be imported by the config. The `space()` plugin loads it instead and passes bindings through the plugin's `config` option.
- **Only declared bindings reach the Worker.** A value in `.dev.vars` that the config does not declare is invisible.
- **`.dev.vars` does not override a declared text var locally.** Use a secret binding for values that differ per environment. At deploy time `--secrets-file` does override.
- **A declared secret that is missing** prints a warning at startup and does not stop the server. Optional secrets trigger the same warning.
- **Type includes.** Use `.space/**/*` in `tsconfig.json`. The plain `.space` entry matches nothing, because TypeScript skips dot folders.
