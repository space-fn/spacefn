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

- `app/` layout with `routes/`, `pages/`, `db/`, `durable-objects/`, `workflows/`.
- `app/entry.ts` — the Worker entry you can customize.
- Path aliases (`@space/*`, `@app/*`, `@modules/*`, `@utils/*`, `@lib/*`).
- Vitest setup with a smoke test.
- `docs/spacefn/` — bundled framework docs.
- `.gitignore` with OS/env/log/coverage ignores.

## License

Apache-2.0