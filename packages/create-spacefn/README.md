# create-spacefn

Creates a [spacefn](https://github.com/space-fn/spacefn) app.

```sh
npm create spacefn@latest my-app
npm create spacefn@latest my-app -- --target bun --lint
```

It asks whether the app runs on Cloudflare Workers or Bun, unless `--target cloudflare` or `--target bun` says so, and whether to add [oxlint](https://oxc.rs/docs/guide/usage/linter) and [oxfmt](https://oxc.rs/docs/guide/usage/formatter), unless `--lint` or `--no-lint` does. With them, the app gets their settings in `configs/` and `npm run check` (format, lint and types) and `npm run fmt`. The app is a small todo list: a page with form actions and a live list, a SQLite database with typed queries, CSRF protection, and a test.

```sh
cd my-app
cp .env.example .env
npm install
npm run dev
```

See the [docs](https://github.com/space-fn/spacefn/blob/main/packages/docs/content/1-getting-started.md).

## License

Apache-2.0
