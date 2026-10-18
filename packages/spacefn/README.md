# spacefn

All-in-one framework for Cloudflare Workers. File-based conventions, full
observability (OTLP), hand-rolled auth primitives, multi-database support.

## Install

```bash
pnpm add spacefn
pnpm add -D space   # CLI (optional, provides the `space` binary)
```

## Quickstart

```bash
pnpm create spacefn my-app
cd my-app
pnpm install
pnpm space dev
```

## Conventions

- `app/` is the only supported layout. `.space/` is generated at the project root.
- `app/routes/` — file-based HTTP routes (`index.ts`, `[id].ts`).
- `app/pages/` — server-rendered pages.
- `app/db/<name>/` — per-database migrations + typed queries.
- `app/durable-objects/`, `app/workflows/` — scanned and exported.
- `app/middleware/`, `app/queues/`, `app/crons/` — scanned.
- `modules/`, `utils/`, `lib/` — business logic (not scanned).

## Path aliases (template)

`@space/*`, `@app/*`, `@modules/*`, `@utils/*`, `@lib/*`.

## Docs

Full docs live in `docs/spacefn/` (bundled in `create-spacefn`). In dev mode,
visit `/__space_docs` to browse them rendered.

## License

Apache-2.0
