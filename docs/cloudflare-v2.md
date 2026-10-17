# Cloudflare v2 foundation

Spike notes for building spacefn on `@cloudflare/vite-plugin@2.0.0-beta.v.1` and `cf@1.0.0-beta.18`. Both are pinned to exact versions because the beta format can change.

## Setup

| Piece         | Choice                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| Vite plugin   | `space()` from `spacefn/vite` returns the folder sync plugin plus the Cloudflare plugin |
| Worker config | Root `cloudflare.config.ts` using `defineSpace()` from `spacefn/cloudflare`             |
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
- Queues, crons, Durable Objects and Workflows map from folders to config entries. The generated worker entry must export the classes.
- Removed Durable Object classes need a user-declared `deleted` entry.
- `space dev` and `space build` wrap Vite. `space deploy` wraps `cf deploy`.
