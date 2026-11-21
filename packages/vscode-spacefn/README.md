# spacefn VS Code extension

Language support for spacefn projects: SQL diagnostics in query files and `` sql`...` `` templates, CSS diagnostics/completion/hover inside `` css`...` `` templates, Datastar attribute validation in `` html`...` ``, and custom-property completion from a project's `variables.css`.

## Features

- SQL diagnostics, completion, hover and go-to-definition in `app/db/<name>/queries/*.sql` and in `` sql`...` `` templates. A template is checked against the database the file imports (`@space/db/<name>.ts`), or the app's only one; templates built with `sql("table")` or `sql.in(...)` are skipped
- CSS diagnostics, hover, and completion inside `css` templates
- Datastar HTML validation in `html` tagged templates
- Commands that run the `space` CLI

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

## Commands

Each runs the CLI in a terminal:

- **spacefn: Doctor** — `space doctor`
- **spacefn: Database Status** — `space db status`
- **spacefn: Generate .space/** — `space gen`

## Activation

Activates for workspaces containing `configs/vite.ts`, and for SQL/JS/TS files. An app's root is the nearest folder whose `package.json` depends on `spacefn`.

## Grammars

Ships TextMate injection grammars for SQL, CSS, and Datastar inside template literals. They are loaded from `src/grammars/`.

## Publishing

The extension package includes a square marketplace icon in `logo.png` for VS Code Marketplace listings.
