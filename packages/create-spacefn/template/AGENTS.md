# Agent guide for spacefn projects

Read the framework docs in `docs/spacefn/` before making changes.

## Doc index

- [auth.md](docs/spacefn/auth.md) — auth primitives (PBKDF2, sessions, CSRF, TOTP).
- [client.md](docs/spacefn/client.md) — bundling browser TS/CSS from `app/client/`.
- [cli.md](docs/spacefn/cli.md) — `space` CLI commands and dev docs reader.
- [docs-reader.md](docs/spacefn/docs-reader.md) — dev docs reader (`/__space_docs`).
- [cloudflare-v2.md](docs/spacefn/cloudflare-v2.md) — Cloudflare v2 config.
- [conventions.md](docs/spacefn/conventions.md) — folder conventions, `app/` layout, `modules/`.
- [database.md](docs/spacefn/database.md) — multi-database, migrations, typed queries.
- [env.md](docs/spacefn/env.md) — environment variables and validation.
- [handlers.md](docs/spacefn/handlers.md) — route handlers and `onError`.
- [pages.md](docs/spacefn/pages.md) — pages, loaders, actions.
- [tenancy.md](docs/spacefn/tenancy.md) — multi-tenancy via Durable Objects.
- [tracing.md](docs/spacefn/tracing.md) — OTLP tracing.

## Conventions

- `app/` is the only supported layout; `.space/` is generated.
- `modules/`, `utils/`, `lib/` are not scanned (business logic).
- Path aliases: `@space/*`, `@app/*`, `@modules/*`, `@utils/*`, `@lib/*`.
- Commit messages: conventional commits, one line, no body.
- Run `vp check` and `vp test` before committing.
