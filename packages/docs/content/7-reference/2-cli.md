---
icon: terminal-2
---

# CLI

`space` comes with `spacefn`. Run it with `npx space <command>`, or through the app's scripts (`npm run dev`).

| Command                                                      | What it does                                                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `space dev [--port N]`                                       | Runs the app locally and regenerates `.space/` on every change. Cloudflare: workerd through Alchemy. Bun: Vite inside Bun, with queues and crons in the same process. |
| `space build`                                                | `vite build` with `configs/vite.ts`, into `dist/` (Bun). Cloudflare builds during `deploy`.                                                                           |
| `space deploy [--stage S] [--yes]`                           | `alchemy deploy configs/infra.ts` for stage `S` (default `prod`). `--yes` skips the approval.                                                                         |
| `space destroy [--stage S] [--yes]`                          | `alchemy destroy configs/infra.ts`: deletes everything stage `S` deployed, its data included.                                                                         |
| `space gen [--watch] [--prod]`                               | Writes `.space/` from `app/` and `configs/`. `--prod` takes `.prod.ts` files instead of `.dev.ts`.                                                                    |
| `space db status\|migrate\|rollback [--db name] [--steps N]` | Migrations of libSQL databases. See [Database](../6-guides/5-database.md).                                                                                            |
| `space doctor`                                               | Checks Node, the config, `.space/`, the target's tools, the bindings in `configs/infra.ts` and `configs/env.ts`, and says what to fix.                                |
| `space upgrade`                                              | Updates spacefn and what moves with it, then regenerates. See [Upgrading](#upgrading).                                                                                |
| `space docs [--port N]`                                      | Serves your `docs/` and spacefn's docs at `http://localhost:4321/`. `space dev` serves them too, at `/__space/docs/`. See [Writing docs](3-writing-docs.md).          |
| `space clean`                                                | Deletes generated files and builds. Keeps local data.                                                                                                                 |

## Upgrading

`space upgrade` reads the latest release from the registry, prints each change as `old → new`, and installs them at once with the app's package manager:

| Package                     | Moves to                                       |
| --------------------------- | ---------------------------------------------- |
| `spacefn`, `spacefn-docs`   | the latest release                             |
| `alchemy` and its providers | the exact version that release is built on     |
| `effect`, `vite`            | what that release needs, if the app's is older |
| everything else             | stays: the app's choice                        |

An exact version stays exact. If the install fails or you stop it, `package.json` and the lockfile are put back and installed again. A version it can't edit, such as `catalog:` or `workspace:`, stops it before anything changes. It needs `npm` to read the registry, whichever package manager the app uses.

> [!IMPORTANT]
> In spacefn 0.11.0, `space upgrade` updates only spacefn. From that version, upgrade with the latest one's instead: `npx spacefn@latest upgrade`.

## Errors

Every command prints errors with a code, the file and a hint, for example:

```txt
[CRON_SCHEDULE_LITERAL] app/crons/nightly.ts: The schedule must be a string literal
  hint: Write it in the file: export default cron("0 3 * * *", job). The infra reads it without running the file.
```
