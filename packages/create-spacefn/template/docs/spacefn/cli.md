# CLI

`space` wraps Vite and Cloudflare's `cf` CLI so a project has one command for the common tasks.

## Dev docs reader

In dev mode, visit `http://localhost:5173/__space_docs` to browse the project's
`docs/` folder rendered as HTML. The whole `docs/` tree is served, including
`docs/spacefn/`.

Markdown is rendered with `marked` when installed, and code blocks are
highlighted with `shiki` when installed. Both are optional peer dependencies;
without them a built-in minimal renderer is used.

## Commands

```sh
space dev              # vite dev
space build            # vite build
space gen              # regenerate .space/ without starting Vite
space deploy           # vite build && cf deploy
space migrate          # apply pending migrations to the shared D1 database
```

- `space dev` and `space build` run Vite, which runs the `space()` plugin. The plugin scans folders, writes `.space/`, and starts the Cloudflare Vite plugin.
- `space gen` is useful in CI, where you want the generated files without a dev server.
- `space deploy` builds and deploys. It needs `cf` installed and authenticated.
- `space migrate` reads `.space/migrations.ts` and applies it to the `DB` binding. Run it through `cf` or `wrangler` so the binding is present.

## Scaffold

```sh
npm create spacefn@latest my-app
```

The scaffold is minimal today: it copies the playground template and installs dependencies. The template includes all of the features shown in the docs.
