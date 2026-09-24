# create-spacefn

Scaffold a new SpaceFn project.

## Usage

```bash
npm create spacefn@latest
# or: pnpm create spacefn@latest
```

The interactive CLI asks for the project directory, package manager (`npm`, `pnpm`, `yarn`, or `bun`), and template. It copies the selected template, substitutes the project name, and optionally installs dependencies.

## Templates

| Template  | Contents                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `minimal` | Vite server, file-based routes/pages/middleware, HTML, DataStar, TypeScript, formatting/linting, and Cloudflare configuration |

## After scaffolding

```bash
cd my-project
pnpm dev
```

Open `http://localhost:5173`. Generated route/page/middleware modules live in `.space/` and should not be edited. See the [getting started guide](../../docs/getting-started.md).
