# spacefn VS Code extension

Language support for spacefn projects: SQL diagnostics in `` sql`...` `` templates, CSS diagnostics/completion/hover inside `` css`...` `` templates, Datastar attribute validation in `` html`...` ``, and custom-property completion from a project's `variables.css`.

## Features

- SQL diagnostics and completion inside tagged template strings
- CSS diagnostics, hover, and completion inside `css` templates
- Datastar HTML validation in `html` tagged templates
- DB health command for local workspace tooling

## Installation

Install from the VS Code Marketplace or from this repository:

```bash
code --install-extension wai-lin.vscode-spacefn
```

## Start a new spacefn project

Create a new app with the scaffolder and then run it locally:

```bash
# It is recommended to run with `npm` to avoid `pnpm` caching the old versions
npm create spacefn@latest my-app
cd my-app
pnpm install
pnpm space dev
```

This uses the `create-spacefn` package to generate the project structure and starter files for a Cloudflare Worker app using `spacefn`.

## Commands

- `spacefn.dbDoctor` — run `npx space db doctor` in a terminal. (Command palette: "space: DB Doctor".)

## Activation

Activates for workspaces containing `app/db` and for SQL/JS/TS files.

## Grammars

Ships TextMate injection grammars for SQL, CSS, and Datastar inside template literals. They are loaded from `src/grammars/`.

## Publishing

The extension package includes a square marketplace icon in `logo.png` for VS Code Marketplace listings.
