# Deploying

```sh
space deploy                 # stage prod
space deploy --stage staging # another copy, with its own resources
space destroy --stage staging
```

`space deploy` generates `.space/` for production, builds (on Bun), and runs [Alchemy](https://alchemy.run), which creates or updates everything the app needs and shows the plan for you to approve. `--yes` skips the prompt, for CI. Each stage is a separate copy of the app, with its own databases and queues. Variables come from `.env.<stage>` and the environment; see [Configuration](config.md).

Alchemy keeps what it deployed in `.space/.alchemy/`, on the machine that deployed. `space clean` never deletes it. Deploy a stage from one place, or the next deploy won't know about the last.

## Cloudflare

One Worker serves the pages and routes, consumes the queues and runs the crons. A deploy creates:

- a D1 database per `d1` database, migrated when the Worker starts;
- a queue and its consumer per file in `app/queues/`;
- a KV namespace if the app imports `Kv`, an R2 bucket if it imports `Blob`;
- the Durable Objects behind `Bus` and `RateLimiter`, and your own from `app/durable-objects/`;
- your workflows from `app/workflows/`, and Cron Triggers for `app/crons/`.

The first deploy asks you to sign in to Cloudflare. Set a domain, routes and other Worker settings in `configs/infra.ts`. `space dev` runs the same Worker locally in workerd, with local D1, KV, R2, queues and Durable Objects; no account needed.

## Bun

The app runs as three kinds of process: the **web** server, the **queue** consumers and the **crons**. By default the web process starts the other two as children and restarts one that crashes, so a slow or failing job never blocks or takes down a request. `SIGTERM` stops all three; a queue process stopped mid-batch hands its messages back.

`space deploy` builds `dist/` (one server bundle plus the client files) and an image from it, then runs one container with a volume on `/data`. It uses local Docker, or the host in `configs/infra.ts`:

```ts
export default defineInfra({ docker: { host: "ssh://deploy@server.example.com", port: 3000 } });
```

`space add docker` copies the Dockerfile to `configs/docker/Dockerfile` to change it.

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
