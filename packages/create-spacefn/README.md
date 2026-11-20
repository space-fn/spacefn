# create-spacefn

Creates a [spacefn](https://github.com/space-fn/spacefn) app.

```sh
npm create spacefn@latest my-app
npm create spacefn@latest my-app -- --target bun
```

It asks whether the app runs on Cloudflare Workers or Bun, unless `--target cloudflare` or `--target bun` says so. The app is a small todo list: a page with form actions and a live list, a SQLite database with typed queries, CSRF protection, and a test.

```sh
cd my-app
cp .env.example .env
npm install
npm run dev
```

See the [docs](https://github.com/space-fn/spacefn/blob/main/packages/docs/content/getting-started.md).

## License

Apache-2.0
