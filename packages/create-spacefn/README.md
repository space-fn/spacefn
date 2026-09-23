# create-spacefn

Scaffold a new SpaceFn project.

## Usage

```bash
npx create-space-app my-project
```

## What It Does

Interactive CLI that:

1. Prompts for project name
2. Selects package manager (npm, pnpm, yarn, bun)
3. Chooses a template
4. Copies the template with project name substitution
5. Optionally installs dependencies

## Templates

| Template  | Description                                            |
| --------- | ------------------------------------------------------ |
| `minimal` | Basic setup with routes, pages, and Cloudflare Workers |

## What's Included

The minimal template sets up:

- `@spacefn/server` — Meta framework
- `@spacefn/html` — Server-side HTML
- `@spacefn/datastar` — Client-side reactivity
- Vite + Cloudflare Workers
- TypeScript + oxlint + oxfmt

## After Scaffolding

```bash
cd my-project
pnpm dev
```

Open `http://localhost:5173` to see your app.

## Project Structure

```
my-project/
  src/
    routes/
      index.ts        # Home page
    middlewares/       # (empty, add your own)
    pages/            # (empty, add your own)
    main.ts           # Entry point
  vite.config.ts
  wrangler.toml
  package.json
```
