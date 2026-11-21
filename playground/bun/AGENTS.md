# Notes for coding agents

This is a spacefn app, on Effect 4. spacefn's docs and examples for the installed version are in `node_modules/spacefn-docs/`: read them before guessing an API.

- `app/` only wires the runtime: its files connect code from `modules/` and `lib/` to routes, pages, jobs and the entry, with no logic or markup of their own.
- A feature's logic, views, client code and tests go in `modules/<feature>/`. Code shared by features (UI kit, design tokens, helpers) goes in `lib/`, which doesn't import `modules/`.
- `.space/` is generated: never edit it. After adding, removing or renaming a file in `app/`, run `npx space gen` (`npm run dev` does it on its own).
- `configs/env.ts` is imported by deploys, so it may import only `spacefn` and `effect`.
- Check your work with `npm run typecheck` and `npm test`; `npx space doctor` explains setup problems.
