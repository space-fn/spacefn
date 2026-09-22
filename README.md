# Space

Server-side rendering framework for Cloudflare Workers. HTML, CSS, and reactivity as TypeScript functions. No client-side framework. No build-time hydration. Just server-rendered pages with DataStar for interactivity.

## Packages

| Package                                          | Description                                |
| ------------------------------------------------ | ------------------------------------------ |
| [`@spacefn/html`](./packages/html)               | Server-side HTML generation                |
| [`@spacefn/css`](./packages/css)                 | Server-side CSS with tokens and variants   |
| [`@spacefn/datastar`](./packages/datastar)       | DataStar client attributes and server SSE  |
| [`@spacefn/vite-plugin`](./packages/vite-plugin) | File-based code generation for Vite        |
| [`@spacefn/server`](./packages/server)           | Meta framework with routing and middleware |

## Quick Start

```bash
# Clone and install
git clone <repo-url> && cd space
pnpm install

# Run tests
pnpm -r test

# Build all packages
pnpm -r build
```

## Project Structure

```
space/
  packages/
    html/           @spacefn/html
    css/            @spacefn/css
    datastar/       @spacefn/datastar
    vite-plugin/    @spacefn/vite-plugin
    server/         @spacefn/server
  configs/
    oxfmt.ts        Formatter config
    oxlint.ts       Linter config
  docs/
    framework.md    Framework design spec
    getting-started.md
```

## Development

```bash
# Format
pnpm fmt

# Lint
pnpm lint

# Typecheck a package
cd packages/<name> && pnpm typecheck
```

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- **Server**: [h3](https://h3.dev/)
- **Reactivity**: [DataStar](https://data-star.dev/)
- **Build**: [Vite](https://vite.dev/) + [tsup](https://tsup.egoist.dev/)
- **Tooling**: [oxlint](https://oxc-project.github.io/oxc/oxc_linter/) + [oxfmt](https://oxc-project.github.io/oxc/oxc_formatter/)

## License

Apache-2.0
