# Agent guide for spacefn projects

Read the framework docs in `docs/spacefn/` before making changes.

## Doc index

### Getting started

- [index.md](docs/spacefn/index.md) - what spacefn is and how it works.
- [getting-started/](docs/spacefn/getting-started/) - install, run, first route and page.
- [concepts/](docs/spacefn/concepts/) - how it works, conventions, import aliases, vite-plus.

### Directory structure

- [directory-structure/](docs/spacefn/directory-structure/) - one page per convention folder: routes, middleware, queues, crons, durable-objects, workflows, pages, client, database, env, modules.

### Guides

- [auth.md](docs/spacefn/guides/auth.md) - auth primitives (PBKDF2, sessions, CSRF, TOTP).
- [client.md](docs/spacefn/directory-structure/client.md) - bundling browser TS/CSS from `app/client/`.
- [cli.md](docs/spacefn/api-reference/cli.md) - `space` CLI commands and dev docs reader.
- [cloudflare-v2.md](docs/spacefn/guides/cloudflare-v2.md) - Cloudflare v2 config.
- [docs-reader.md](docs/spacefn/guides/docs-reader.md) - dev docs reader (`/__space_docs`).
- [tenancy.md](docs/spacefn/guides/tenancy.md) - multi-tenancy via Durable Objects.
- [tracing.md](docs/spacefn/guides/tracing.md) - OTLP tracing.
- [testing.md](docs/spacefn/guides/testing.md) - testing routes, DB, and Workers.

### API reference

- [api-reference/](docs/spacefn/api-reference/) - handlers, env, config, generated code, pages, cli.

## Conventions

- `app/` is the only supported layout; `.space/` is generated.
- Do not modify `docs/spacefn/`; `space upgrade` can replace everything in that folder.
- `modules/`, `utils/`, `lib/` are not scanned (business logic).
- Path aliases: `@space/*`, `@app/*`, `@modules/*`, `@utils/*`, `@lib/*`.
- Commit messages: conventional commits, one line, no body.
- Run `vp check` and `vp test` before committing.
