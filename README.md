# SpaceFn

SpaceFn is a TypeScript server-rendering toolkit for Cloudflare Workers and Web API runtimes. It provides functional HTML, server-generated CSS, DataStar attributes/SSE helpers, convention-based Vite code generation, routing, middleware, and database schema generation.

The packages are independent. Use `@spacefn/html` or `@spacefn/css` without adopting the server framework.

## Packages

| Package                                          | Purpose                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| [`@spacefn/html`](./packages/html)               | Typed server-side HTML elements, escaping, components, and rendering |
| [`@spacefn/css`](./packages/css)                 | Design tokens, class generation, variants, and transition helpers    |
| [`@spacefn/datastar`](./packages/datastar)       | Typed DataStar attributes, HTTP expressions, and server-side SSE     |
| [`@spacefn/vite-plugin`](./packages/vite-plugin) | Generic Vite file scanning and code generation                       |
| [`@spacefn/server`](./packages/server)           | File-based routes/pages/middleware and Web API server handler        |
| [`@spacefn/db`](./packages/db)                   | Schema definitions, SQL diffs, migrations, and generated types       |
| [`create-spacefn`](./packages/create-spacefn)    | Project scaffolding CLI                                              |

## Create an application

```bash
npm create spacefn@latest
# or: pnpm create spacefn@latest
```

Choose a package manager and the `minimal` template. Then:

```bash
cd my-project
pnpm dev       # or npm run dev
curl http://localhost:5173/
pnpm build     # or npm run build
```

The template contains `src/main.ts`, file-based routes, optional page loaders/components, a Vite config, and Cloudflare configuration. Generated files are written to `.space/` and should not be committed.

## Local repository development

```bash
pnpm install
pnpm -r test
pnpm -r build
pnpm fmt:check
pnpm lint
pnpm --filter playground dev
```

The `playground/` workspace is a local copy of the minimal template. It uses workspace packages so package changes can be smoke-tested without publishing.

## Project conventions

```text
src/
  main.ts                 # createServer entry point
  routes/                 # request handlers
  pages/                  # *.server.ts loaders/actions + *.page.ts components
  middlewares/            # ordered request middleware
.space/                   # generated route/page/middleware modules
```

Route file names become URL patterns. Numeric middleware prefixes determine order. See the [getting started guide](./docs/getting-started.md), [framework overview](./docs/framework.md), and package documentation for details.

## Development commands

```bash
pnpm fmt              # format repository files
pnpm fmt:check        # verify formatting
pnpm lint             # lint repository files
pnpm -r test          # run package and playground tests
pnpm -r build         # build packages (exclude playground if needed)
```

`pnpm -r test` requires at least one test file in every selected workspace. The playground has a smoke test and is included in the workspace.

## License

Apache-2.0
