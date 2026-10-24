# spacefn VS Code extension

Language support for spacefn projects: SQL diagnostics in `` sql`...` `` templates, CSS diagnostics/completion/hover inside `` css`...` `` templates, Datastar attribute validation in `` html`...` ``, and custom-property completion from a project's `variables.css`.

## Commands

- `spacefn.dbDoctor` — run `npx space db doctor` in a terminal. (Command palette: "space: DB Doctor".)

## Activation

Activates for workspaces containing `app/db` and for SQL/JS/TS files.

## Grammars

Ships TextMate injection grammars for SQL, CSS, and Datastar inside template literals. They are loaded from `src/grammars/`.
