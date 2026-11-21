# spacefn

Full-stack TypeScript apps from folders of convention files, on [Effect](https://effect.website). Write pages, routes, SQL and jobs in `app/`; spacefn generates the wiring, and the `space` CLI runs, builds and deploys it, to **Cloudflare Workers** or to **Bun** in Docker.

Start a new app with the scaffolder:

```sh
npm create spacefn@latest my-app
```

This one package has everything: the framework, both targets, the Vite plugin, the Alchemy stacks and the `space` CLI. A Cloudflare app also installs `@alchemy.run/cloudflare`, and a Bun app `@alchemy.run/docker`. Each is an optional peer, so a Bun app never downloads workerd.

| Import                                                                  | For                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `spacefn`                                                               | App code: routes, pages, `html`, database, services, jobs, auth   |
| `spacefn/infra`                                                         | `configs/infra.ts`: `defineInfra`                                 |
| `spacefn/testing`                                                       | Tests: in-memory services, a test database and `testHttp`         |
| `spacefn/assets`                                                        | `head`, the client's tags; the Vite plugin provides it            |
| `spacefn/cloudflare`                                                    | Cloudflare bindings spacefn doesn't wrap, through `CloudflareEnv` |
| `spacefn/bun`                                                           | The Bun server; generated code uses it                            |
| `spacefn/vite`                                                          | The Vite plugin, in `configs/vite.ts`: `space({ target })`        |
| `spacefn/runtime`, `codegen`, `sql`, `infra/cloudflare`, `infra/docker` | Generated code, the CLI and the editor extension                  |

Read the [docs](https://github.com/space-fn/spacefn/blob/main/packages/docs/content/index.md).

## License

Apache-2.0
