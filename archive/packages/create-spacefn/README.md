# create-spacefn

Scaffold a new SpaceFn project with a single command.

## Usage

```bash
npm create spacefn@latest
# or: pnpm create spacefn@latest
```

The interactive CLI asks for the project name, copies the template, and pins every dependency to the latest version published on the npm registry. It then prints the install command for the package manager that invoked it.

## What's included

- **@spacefn/asteroids** — HTML, CSS, DataStar, Database, Hono utilities
- **@spacefn/cli** — `space dev`, `space build`, `space test`, `space fmt`, `space lint`, `space run`
- **Hono** — Web framework for Cloudflare Workers
- **Vite + Cloudflare** — Dev server and production build
- **Biome** — Linter and formatter (via CLI)
- **Vitest** — Testing
- **Example files** — Route, page, database schema, and custom script

## After scaffolding

```bash
cd my-project
npm install # or pnpm install / yarn / bun install
npm run dev
```

Open `http://localhost:5173`. See the [getting started guide](../../docs/getting-started.md).
