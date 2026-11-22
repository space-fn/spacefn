# Examples

Apps that show spacefn's conventions in full: `app/` only wires, the code is in `modules/<feature>/` and `lib/`. Each one is tested in the repo, and ships in `spacefn-docs` (`node_modules/spacefn-docs/examples/`) at the version you have installed.

| Example               | Target     | What it shows                                                                        |
| --------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `starter-cloudflare`  | Cloudflare | What `npm create spacefn` makes: todos with D1, a live list with Datastar            |
| `starter-bun`         | Bun        | The same app on Bun, deployed to Docker                                              |
| `services-cloudflare` | Cloudflare | Every binding a deploy creates in use: D1, KV, R2, a queue, a cron, the rate limiter |
| `services-bun`        | Bun        | KV, a queue, a cron, `public/` and the client build, deployed to Docker              |
| `datastar`            | Cloudflare | A live poll: html components with fixed ids, signals under `poll.`, a Rocket element |
| `tailwind`            | Bun        | Tailwind v4: design tokens in `@theme`, a UI kit in `lib/ui/`, a live search         |
| `lightningcss`        | Bun        | Plain CSS through Lightning CSS: nesting, custom media, `light-dark()`, lowered      |
| `react`, `solid`      | Bun        | A client-only cart island on a server-rendered page, loaded by one page only         |
| `vue`, `svelte`       | Cloudflare | The same island with Vue and Svelte single-file components                           |
| `mini-shopify`        | Bun        | A database per shop: created with Turso's Platform API, opened per request           |

In the repo, the starters are copies of the `create-spacefn` template, and `pnpm install` gives every example the workspace's packages. Run one with `cd examples/<name> && pnpm dev`.
