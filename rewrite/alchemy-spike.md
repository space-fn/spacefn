# Alchemy spike (step 1)

Run on 2026-11-19 with `alchemy`, `@alchemy.run/cloudflare` and `@alchemy.run/docker` 2.0.0-beta.87, effect 4.1.4, Bun 1.3.14, Docker 29.4 (OrbStack). The spike code was throwaway; the important snippets are below.

**Verdict: adopt Alchemy for `@spacefn/infra`.** Every Cloudflare check passed. Every Bun/Docker check passed except a real SSH host, which wasn't available.

## Results

| Check                                                                                    | Result                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alchemy dev` with no Cloudflare login                                                   | ✅ No account or token needed. Ready in about 0.6s.                                                                                                                                                                                                                                                  |
| Plain module Worker entry (`export default { fetch, queue, scheduled }` plus a DO class) | ✅ Use `main` and `env` on `Cloudflare.Worker`. The bundle contains no Alchemy code (1.6 KB for a plain Worker).                                                                                                                                                                                     |
| D1 locally                                                                               | ✅                                                                                                                                                                                                                                                                                                   |
| KV locally                                                                               | ✅                                                                                                                                                                                                                                                                                                   |
| R2 locally                                                                               | ✅                                                                                                                                                                                                                                                                                                   |
| Durable Object with SQLite (`ctx.storage.sql`) locally                                   | ✅                                                                                                                                                                                                                                                                                                   |
| Queue send and consume locally                                                           | ✅ Needs a separate `Queues.Consumer`.                                                                                                                                                                                                                                                               |
| Cron locally                                                                             | ✅ Fires on schedule; it shows in the dev log.                                                                                                                                                                                                                                                       |
| Live reload of the entry and of the stack file                                           | ✅ About 90ms per restart.                                                                                                                                                                                                                                                                           |
| Local data survives a dev restart                                                        | ✅                                                                                                                                                                                                                                                                                                   |
| Run file at `.space/alchemy.run.ts`                                                      | ✅ Pass it as an argument: `alchemy dev alchemy.run.ts`.                                                                                                                                                                                                                                             |
| State under `.space/`                                                                    | ✅ `.alchemy/` is created in the working directory, so we run the CLI with cwd `.space/`. That gives `.space/.alchemy/{state,local,bundles,log}`. The CLI has no flag to move it.                                                                                                                    |
| Effect `HttpRouter.toWebHandler` in the Worker                                           | ✅                                                                                                                                                                                                                                                                                                   |
| `@effect/sql-d1` in the Worker                                                           | ✅                                                                                                                                                                                                                                                                                                   |
| `@effect/sql-sqlite-do` in the Worker                                                    | ✅                                                                                                                                                                                                                                                                                                   |
| Worker size with Effect, HTTP and both SQL drivers                                       | 300 KB raw, 89 KB gzipped                                                                                                                                                                                                                                                                            |
| Bun container built from our own Dockerfile (`Docker.Image` plus `Docker.Container`)     | ✅ 11s for the first deploy. Redeploying changed code takes 0.4s.                                                                                                                                                                                                                                    |
| Bun to `sqld` over HTTP (`@effect/sql-libsql` with `@libsql/client/web`)                 | ✅                                                                                                                                                                                                                                                                                                   |
| Graceful shutdown on `docker stop`                                                       | ✅ Exit 0 in 0.16s.                                                                                                                                                                                                                                                                                  |
| `alchemy destroy` cleans up containers, network and image                                | ✅                                                                                                                                                                                                                                                                                                   |
| Deploy to a remote Docker host over SSH                                                  | ⚠️ Not run, because no host was available. It's supported in code: `Docker.Context("vps", { docker: "host=ssh://deploy@host" })` is passed as `context` to every Docker resource. Alchemy drives the plain `docker` CLI, so this is standard Docker over SSH. Retest against the OVH box in step 12. |

## Shapes to use

Cloudflare stack (generated as `.space/alchemy.run.ts`):

```ts
export default Alchemy.Stack(
	"app",
	{ providers: Cloudflare.providers(), state: Alchemy.localState() },
	Effect.gen(function* () {
		const db = yield* Cloudflare.D1.Database("DB");
		const jobs = yield* Cloudflare.Queues.Queue("JOBS");
		const worker = yield* Cloudflare.Worker("App", {
			main: new URL("./entry.ts", import.meta.url).pathname,
			crons: ["*/5 * * * *"],
			env: { DB: db, JOBS: jobs, ROOM: Cloudflare.DurableObject("Room"), GREETING: "hi" },
		});
		yield* Cloudflare.Queues.Consumer("JobsConsumer", {
			queueId: jobs.queueId,
			scriptName: worker.workerName,
		});
		return { url: worker.url };
	}),
);
```

Effect inside the plain Worker:

```ts
import { env } from "cloudflare:workers";
const Routes = HttpRouter.add("GET", "/x", handler).pipe(
	HttpRouter.provideRequest(D1Client.layer({ db: env.DB })), // Layer.provide does NOT satisfy handler requirements
	Layer.provide(HttpServer.layerServices),
);
export const app = HttpRouter.toWebHandler(Routes); // build once per isolate
```

Bun target: the same `toWebHandler`, behind `Bun.serve({ fetch: app.handler })`, bundled with `bun build --target bun`. Deployed with:

```ts
const image = yield* Docker.Image("AppImage", { build: { context: root, dockerfile: "configs/docker/Dockerfile" } });
yield* Docker.Container("App", { image, start: true, restart: "unless-stopped", ports: [...], networks: [...] });
```

## Gotchas for step 12

- **`Docker.Container` needs `start: true`.** Without it the container is only created and never starts.
- **Don't use `Docker.Service` or a bundled `main`.** Those target Swarm and expect an Alchemy Effect program, which would couple the runtime to Alchemy. Use `Docker.Image` with our own Dockerfile plus `Docker.Container`.
- **Docker resources have no emulated mode.** `alchemy dev` would really run them. For Bun dev, `space dev` should run `bun --hot .space/server.ts` directly, plus a local `sqld` (or a file database).
- **`sqld` needs a `Docker.Volume`.** In the spike, data survived only because that container wasn't replaced.
- **OVH is amd64.** Set `build.platform: "linux/amd64"` when building on Apple Silicon.
- **Deploy prompts for approval.** Use `alchemy deploy --yes --no-input` in CI and in `space deploy`.
- **Worker console output appears in the `alchemy dev` log.** Effect's HTTP logger needs `disableLogger: false` while debugging.
- **The `vite` peer is optional** on `alchemy` and `@alchemy.run/cloudflare`, so we don't need Vite.
- **The install is heavy.** About 620 MB of node_modules (workerd and the providers), so keep it out of the core: only `@spacefn/infra` depends on Alchemy.
