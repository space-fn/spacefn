# vite-plus (`vp`)

spacefn uses [vite-plus](https://github.com/voidzero-dev/vite-plus) (`vp`) as its single toolchain. Instead of juggling Vite, Vitest, ESLint, Prettier, and a package manager separately, `vp` wraps all of them behind one command.

## What `vp` provides

- **`vp dev`** — start the dev server (Vite on `workerd`).
- **`vp build`** — production build of the Worker and the client bundle.
- **`vp check`** — format + lint + type check in one pass.
- **`vp check --fix`** — apply formatting and auto-fixable lint fixes.
- **`vp test run`** — run the test suite (Vitest).
- **`vp test`** — watch mode for tests.
- **`vp gen`** / `space gen` — regenerate `.space/` without starting Vite.

`vp` also manages dependencies and scripts, so `npm run ...` is not required.

## Day to day

```sh
vp install          # install dependencies
vp dev              # start dev server
vp check            # format + lint + type check
vp test run         # run tests
vp build            # production build
```

Before every commit, run:

```sh
vp check && vp test run
```

## Why one tool

A spacefn project ships with a `vite.config.ts` that uses the `space()` plugin. `vp` reads that config the same way Vite does, so there is no separate Vite install or version to manage. The formatter, linter and test runner share the same config and cache, which keeps CI fast and consistent.

## Extending

`vp` accepts the usual Vite config, so anything you would add to a Vite project (plugins, `resolve.alias`, `define`, `optimizeDeps`) works unchanged. spacefn-specific options go under the `space()` plugin (`client`, `cloudflare`).

See [import aliases](./import-aliases.md) for the `@space/*` etc. alias setup that `vp` resolves.
