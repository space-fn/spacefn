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

## Where code goes

Read [modules.md](docs/spacefn/directory-structure/modules.md) before writing code. The rules:

- `app/` is setup only. A file there reads its input (request, form, message, event), calls a function from `modules/`, and returns or acknowledges the result. No business rules, validation of meaning, or calculations in `app/`.
- `modules/<feature>/` holds the project's code: rules, use cases, and HTML fragments, with a public `index.ts` and tests next to it.
- `utils/` holds small pure helpers, including `AppError` in `utils/errors.ts`. `lib/` holds clients for third-party services that take their config as arguments.
- Code outside `app/` never touches the request context `c`, `env`, `cloudflare:workers`, `@space/queues`, `@space/worker`, or `@app/*`. Pass bindings, config values, and `send` functions in as arguments.
- `modules/` may import the generated queries from `@space/db/<name>`, the `DbReader` type from `spacefn/db`, and pure helpers from `spacefn/auth` and `spacefn/html`. `utils/` and `lib/` import no spacefn code.
- Modules throw `AppError` with a kind (`invalid`, `not_found`, ...); `app/entry.ts` maps kinds to HTTP statuses.
- Each database has a connect helper, `app/db/<name>.ts`, that runs migrations and returns the executor modules receive.

## Conventions

- `app/` is the only supported layout; `.space/` is generated.
- Do not modify `docs/spacefn/`; `space upgrade` can replace everything in that folder.
- `modules/`, `utils/`, `lib/` are not scanned by the framework.
- Path aliases: `@space/*`, `@app/*`, `@modules/*`, `@utils/*`, `@lib/*`.
- Commit messages: conventional commits, one line, no body.
- Run `vp check` and `vp test` before committing.
