# Deploying

```sh
space deploy                 # stage prod
space deploy --stage staging # another copy, with its own resources
space destroy --stage staging
```

`space deploy` generates `.space/` for production and runs `alchemy deploy configs/infra.ts --stage <stage>`. [Alchemy](https://alchemy.run) creates or updates what the stack declares and shows the plan for you to approve. `--yes` skips the prompt, for CI. Each stage is a separate copy of the app, with its own databases and queues. Variables come from `.env.<stage>` and the environment; see [Configuration](5-reference/1-config.md).

## `configs/infra.ts`

The app's infrastructure is a plain Alchemy stack, scaffolded with the app and yours to change. It's what `alchemy deploy` would run, so Alchemy's docs cover everything in it. spacefn adds two things:

- `#space/infra.ts`, generated from `app/` like the manifest, holds what the file conventions ask for as plain data: `app.name`, `app.databases`, `app.queues`, `app.crons`, `app.durableObjects`, `app.workflows` and `app.folders`. The stack loops over these lists, so a new database folder or queue file gets its resource on the next deploy. It imports no app code.
- `variables(...)` from `spacefn/infra` reads values from the environment for the deploy to pass on: `variables(env)` takes `configs/env.ts`'s fields, and `variables({ NAME: "plain" | "secret" })` takes the ones listed. Secrets become Worker secrets on Cloudflare. Unset variables are left out.

Everything else is written out: the KV namespace, the R2 bucket, the Durable Objects behind `Bus` and `RateLimiter`, the Worker or the container. Remove what you don't use and add what you need beside it, such as a domain on the Worker or Workers AI:

```ts [configs/infra.ts]
const worker =
	yield *
	Cloudflare.Website.Vite("Worker", {
		// ...
		domain: "todo.example.com",
		env: { ...bindings, AI: yield * Cloudflare.Ai("AI") },
	});
```

Read a binding spacefn doesn't wrap with `CloudflareEnv` from `spacefn/cloudflare`. `space doctor` names any binding the conventions need that `configs/infra.ts` doesn't give, and a Worker missing one says which when it's used.

### State

Alchemy records what each stage deployed. On Cloudflare the stack keeps it in your account, with `Cloudflare.state()`, so CI and other machines see the same deploys; `space dev` uses `Alchemy.localState()` instead. On Bun it's `Alchemy.localState()`, in `.alchemy/` at the app root: deploy a stage from one machine, or move the state to a shared store. `.alchemy/` is in `.gitignore`.

## Cloudflare

One Worker serves the pages and routes, consumes the queues and runs the crons. The scaffolded stack creates:

- a D1 database per `d1` database, migrated when the Worker starts;
- a queue and its consumer per file in `app/queues/`, named `<app>-<stage>-<queue>` since queue names are unique per account (the Worker strips `SPACE_QUEUE_PREFIX` to find the file);
- a KV namespace and an R2 bucket, for `Kv` and `Blob` (R2 must be enabled on the account);
- the Durable Objects behind `Bus` and `RateLimiter`, and your own from `app/durable-objects/`;
- your workflows from `app/workflows/`, and Cron Triggers for `app/crons/`.

The first deploy asks you to sign in to Cloudflare. `space dev` runs the same stack locally with `alchemy dev`: the Worker in workerd, with local D1, KV, R2, queues and Durable Objects; no account needed.

## Bun

The app runs as three kinds of process: the **web** server, the **queue** consumers and the **crons**. By default the web process starts the other two as children and restarts one that crashes, so a slow or failing job never blocks or takes down a request. `SIGTERM` stops all three; a queue process stopped mid-batch hands its messages back.

The scaffolded stack builds an image with `configs/Dockerfile`, from the app's source: it installs the dependencies, runs `vite build` and keeps only `dist/`. `configs/Dockerfile.dockerignore` keeps local files out of the build. Then it runs one container with a volume on `/data`, in local Docker. To deploy to a server, give the image, volume and container a context:

```ts [configs/infra.ts]
const context = yield * Docker.Context("Host", { docker: "host=ssh://deploy@server.example.com" });
const image = yield * Docker.Image("Image", { context /* ... */ });
```

| Variable          | Default                              | What it does                                                      |
| ----------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `PORT`, `HOST`    | `3000`, all                          | Where the web server listens                                      |
| `SPACE_DATA_DIR`  | `.space/data` (`/data` in the image) | Local databases, the state database, blobs                        |
| `SPACE_STATE_URL` | a file in the data dir               | The state database behind Kv, Queue, Bus and RateLimiter (libSQL) |
| `DB_<NAME>_URL`   | a file in the data dir               | A libSQL database: `libsql://`, `https://` or `file:`             |
| `SPACE_ROLE`      | unset: web, starting the others      | `web`, `queues` or `crons`: run one part per process              |

To run more than one machine, point `SPACE_STATE_URL` and the databases at a shared libSQL server (Turso or `sqld`), run several `SPACE_ROLE=web` and `SPACE_ROLE=queues` processes, and exactly one `SPACE_ROLE=crons`. Blob stays a local folder for now, so it needs a shared volume.

Without Docker, `space build` then `bun dist/server/index.js` runs the same thing.

## Telemetry

Traces, logs and metrics go over OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (with `OTEL_EXPORTER_OTLP_HEADERS` for the key), to any OpenTelemetry backend. Requests and queries are traced already; add spans with `Effect.withSpan`. The service name is the app's name unless `OTEL_SERVICE_NAME` says otherwise.
