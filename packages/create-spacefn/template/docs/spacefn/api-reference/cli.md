# CLI

`space` wraps Vite and Cloudflare's `cf` CLI so a project has one command for the common tasks.

## Dev docs reader

In dev mode, visit `http://localhost:5173/__space_docs` to browse the project's
`docs/` folder rendered as HTML. The whole `docs/` tree is served, including
`docs/spacefn/`.

See [the docs reader guide](../guides/docs-reader.md) for the full behavior. Markdown is rendered with `marked` when installed, and code blocks are
highlighted with `shiki` when installed. Both are optional peer dependencies;
without them a built-in minimal renderer is used.

## Commands

```sh
space dev              # vite dev
space build            # vite build
space gen              # regenerate .space/ without starting Vite
space deploy           # vite build && cf deploy
space db doctor        # check migrations and SQL queries
space doctor           # check project layout and generated files
space clean            # remove .space/ and .cloudflare/
```

- `space dev` and `space build` run Vite, which runs the `space()` plugin. The plugin scans folders, writes `.space/`, and starts the Cloudflare Vite plugin.
- `space gen` is useful in CI, where you want the generated files without a dev server.
- `space deploy` builds and deploys through `cf`, the Cloudflare CLI that ships with `spacefn` as a dependency. Apps do not install it; it needs an authenticated Cloudflare session.
- `space db doctor --db main_db` checks one database; `--json` prints machine-readable results. With no `--db`, it checks every folder under `app/db/`.
- `space doctor` checks the app layout, generated `.space/`, the `@space/*` TypeScript alias, and local secret-file setup.
- `space clean` deletes only generated `.space/` and `.cloudflare/` directories. Run `space gen` or `space dev` to recreate generated files.

## Scaffold

```sh
npm create spacefn@latest my-app
```

The scaffold copies the template; it does not install dependencies. After creating a project, run `pnpm install` (or `npm install`). The template includes the app entrypoint and examples of the core conventions; other features are added as needed.
