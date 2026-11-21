---
icon: brand-cloudflare
---

# Cloudflare

On Cloudflare, one Worker serves the pages and routes, consumes the queues and runs the crons. The client build is served as static assets in front of it.

```sh
space deploy
```

The first deploy asks you to sign in to Cloudflare in the browser. In CI, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` instead; see [CI/CD](4-ci-cd.md).

## What it creates

The scaffolded `configs/infra.ts` creates, for each stage:

| From                           | Resource                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| the app                        | a Worker, with the client build as its assets                        |
| `app/db/<name>/` with `d1`     | a D1 database, migrated when the Worker starts                       |
| `app/db/<name>/` with `libsql` | nothing: it reads `DB_<NAME>_URL` and `DB_<NAME>_AUTH_TOKEN`         |
| `app/queues/<name>.ts`         | a queue named `<app>-<stage>-<name>`, and the Worker as its consumer |
| `app/crons/`                   | a Cron Trigger per schedule                                          |
| `app/durable-objects/`         | a Durable Object binding per class                                   |
| `app/workflows/`               | a Workflow per class                                                 |
| `Kv`, `Blob`                   | a KV namespace and an R2 bucket                                      |
| `Bus`, `RateLimiter`           | the Durable Objects behind them                                      |
| `configs/env.ts`               | vars, and Worker secrets for `Env.secret()` fields                   |

Queue names are unique per account, so they carry the app and the stage. Remove what the app doesn't use, such as the R2 bucket, and add what it needs beside the rest.

## A domain

Give the Worker a domain in `configs/infra.ts`; the zone must be in the same account:

```ts [configs/infra.ts]
const worker =
	yield *
	Cloudflare.Website.Vite("Worker", {
		// ...
		domain: stage === "prod" ? "todo.example.com" : `${stage}.todo.example.com`,
	});
```

## Locally

`space dev` runs the same stack with `alchemy dev`: the Worker in workerd, with local D1, KV, R2, queues, Durable Objects and workflows. No account is needed, and the local state stays on your machine.

## Things to know

- **D1 has no transactions.** spacefn runs a migration, or other atomic work, as one batch.
- **KV is eventually consistent**, and keeps a value for at least 60 seconds; shorter TTLs are raised to 60.
- **State.** Alchemy keeps what each stage deployed in your Cloudflare account (`Cloudflare.state()`), so a deploy from CI and one from your machine see the same thing.
- **Bindings spacefn doesn't wrap**, such as Workers AI, are added in `configs/infra.ts` and read with `CloudflareEnv` from `spacefn/cloudflare`. `space doctor` names a binding that `app/` needs and the stack doesn't give.
