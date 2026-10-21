# create-spacefn

Scaffold a new spacefn project.

## Usage

```bash
pnpm create spacefn my-app
cd my-app
pnpm install
pnpm space dev
```

The generated project includes:

- `app/` layout with `routes/`, plus `pages/`, `db/`, `durable-objects/`, `workflows/` when you need them.
- `app/entry.ts` — the Worker entry you can customize.
- Path aliases (`@space/*`, `@app/*`, `@modules/*`, `@utils/*`, `@lib/*`).
- vite-plus test setup with scaffold tests.
- `docs/spacefn/` — bundled framework docs.
- `.gitignore` with OS/env/log/coverage ignores.

## License

Apache-2.0
