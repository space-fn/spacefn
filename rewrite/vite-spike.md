# Vite spike

Run on 2026-11-19 with vite 8.3.8, `@cloudflare/vite-plugin` 1.70.0, `@tailwindcss/vite` 4.3.5, Alchemy 2.0.0-beta.87, effect 4.1.4, Bun 1.4.4. The spike code was throwaway; the important snippets are below.

**Verdict: Vite is the only build system, for both targets.** Dev, hot reload, the client build and the server bundle all go through Vite. There is no tsdown, rolldown CLI or `bun build` in user apps (tsdown stays for building our own packages).

## Results

| Check                                                     | Cloudflare (`alchemy dev` + `Website.Vite`)                                        | Bun (Vite running inside Bun)                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Server code runs on the real runtime in dev               | ✅ workerd                                                                         | ✅ `Bun.version` is available in route code                                  |
| Effect `HttpRouter`, D1, DO SQLite, queue, cron under dev | ✅                                                                                 | ✅ Effect `HttpRouter` (the libSQL path was already proven in step 1)        |
| User plugins from `configs/vite.config.ts` (Tailwind)     | ✅                                                                                 | ✅                                                                           |
| Client JS edit                                            | ✅ HMR, no page reload                                                             | ✅ HMR, no page reload                                                       |
| Server edit (HTML and Tailwind classes)                   | ✅ browser reloads, new code on the next request, no restart                       | ✅ same                                                                      |
| `configs/vite.config.ts` or plugin edit                   | ✅ Vite restarts itself                                                            | ✅                                                                           |
| Production build                                          | ✅ one `vite build`: client first, then the Worker with hashed asset tags embedded | ✅ one `vite build`: client, then a single server bundle                     |
| Server bundle                                             | 223 KB minified, 75 KB gzipped, no Alchemy code                                    | 702 KB unminified, self-contained: runs from a folder with no `node_modules` |

## How it fits together

- **Generated `.space/vite.config.ts`** merges the user's `configs/vite.config.ts` with the spacefn plugin. No root files are needed.
- **Cloudflare:** `.space/alchemy.run.ts` declares `Cloudflare.Website.Vite("App", { rootDir: import.meta.dirname, main: "./entry.ts", env, crons, memo })`. Alchemy injects the Cloudflare Vite plugin for both `alchemy dev` and deploy, so we never configure it.
- **Bun:** `space dev` calls Vite's `createServer` from a Bun process. The plugin's middleware imports `.space/bun/app.ts` through the `ssr` environment's module runner, which runs in-process on Bun. `space build` runs `vite build`, and production is `bun .space/dist/server/index.js`: `Bun.serve` plus `/assets/*` from `dist/client`.
- **`virtual:space/assets`** gives server code the `<script>`/`<link>` tags. In dev these are `/@vite/client` plus the source entries. In a build they come from the client manifest; that works because the plugin's `buildApp` hook (`order: "pre"`) builds the client before any server environment.

## Gotchas for steps 5, 12 and 13

- **Alchemy roots Vite where the config file lives** (`rootDir`, with no `configFile` option). The spacefn plugin must set `root` back to the project root from its `config` hook. Otherwise Tailwind scans `.space/` and finds no classes, and client URLs become `/@fs/...`.
- **`outDir` must be explicit:** `build.outDir` = `.space/dist`, plus `environments.client.build.outDir` = `.space/dist/client`. Otherwise `dist/` lands in the project root.
- **`.space/` must be in `.gitignore`.** Without it Tailwind watches `.space/.alchemy/log` and pushes about 10 CSS updates a second. `space doctor` should check this.
- **Vite's watcher ignores `.gitignore`.** The plugin sets `server.watch.ignored` for `.space/.alchemy/**` and `.space/dist/**`, or Alchemy's log file causes a page-reload loop.
- **The Cloudflare plugin doesn't reload the browser on Worker changes.** The plugin's `hotUpdate` sends `full-reload` to the client when a non-client environment changes.
- **Bun needs `appType: "custom"`.** Otherwise Vite's SPA fallback rewrites `/` to `/index.html` before the app sees it.
- **With a `pre` buildApp hook, Vite stops building the other environments by default.** The Bun plugin adds a `post` hook that builds every environment not yet built. The Cloudflare plugin's own hook already does this.
- **Alchemy's `memo` hashes `rootDir` only (`.space/`).** Pass `memo.include: ["**/*", "../app/**", "../configs/**", ...]` plus `lockfile: true`, or deploys skip the rebuild when only `app/` changed.
- **Server bundles are unminified by default.** Set `build.minify: true` on the server environment: 889 KB drops to 223 KB.
- **Alchemy needs `@effect/platform-node` installed beside it.** It's a peer dependency, so `@spacefn/infra` must depend on it.
- **Effect's HTTP logger reports `RouteNotFound` at INFO.** That's noise in dev, so tune it in step 6.

## Where the plugin lives

The plugin is build tooling and must not be in the core runtime. Both targets need it, and Bun dev doesn't use Alchemy. It goes in `@spacefn/infra` (subpath `@spacefn/infra/vite`), and step 12 decides whether the Cloudflare provider (workerd, the bulk of the 620 MB) can be an optional peer, so Bun-only apps don't install it.
