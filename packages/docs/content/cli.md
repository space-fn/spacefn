# CLI

`space` comes with `spacefn`. Run it with `npx space <command>`, or through the app's scripts (`npm run dev`).

| Command                                                      | What it does                                                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `space dev [--port N]`                                       | Runs the app locally and regenerates `.space/` on every change. Cloudflare: workerd through Alchemy. Bun: Vite inside Bun, with queues and crons in the same process. |
| `space build`                                                | Bun: builds `.space/dist`. Cloudflare builds during `deploy`.                                                                                                         |
| `space deploy [--stage S] [--yes]`                           | Builds and deploys stage `S` (default `prod`). `--yes` skips the approval.                                                                                            |
| `space destroy [--stage S] [--yes]`                          | Deletes everything stage `S` deployed, its data included.                                                                                                             |
| `space gen [--watch] [--prod]`                               | Writes `.space/` from `app/` and `configs/`. `--prod` takes `.prod.ts` files instead of `.dev.ts`.                                                                    |
| `space db status\|migrate\|rollback [--db name] [--steps N]` | Migrations of libSQL databases. See [Database](database.md).                                                                                                          |
| `space doctor`                                               | Checks Node, the config, `.space/`, the target's tools and `app/env.ts`, and says what to fix.                                                                        |
| `space upgrade`                                              | Updates spacefn, its Alchemy provider and `@spacefn/docs`, then regenerates.                                                                                          |
| `space docs [--port N]`                                      | Serves your `docs/` and spacefn's docs at `http://localhost:4321/`. `space dev` serves them too, at `/__space/docs/`. See [Writing docs](writing-docs.md).            |
| `space clean`                                                | Deletes generated files and builds. Keeps deploy state and local data.                                                                                                |
| `space add docker`                                           | Copies the Dockerfile to `configs/docker/Dockerfile`.                                                                                                                 |

Every command prints errors with a code, the file and a hint, for example:

```txt
[CRON_SCHEDULE_LITERAL] app/crons/nightly.ts: The schedule must be a string literal
  hint: Write it in the file: export default cron("0 3 * * *", job). The infra reads it without running the file.
```
