# Deployment

spacefn apps deploy as Cloudflare Workers. The app is built by Vite, then the Worker is deployed through the Cloudflare beta CLI (`cf`). The generated `cloudflare.config.ts` remains the source of truth for bindings and the Worker entrypoint.

For the simplest setup, connect the repository to the Cloudflare dashboard and let Cloudflare handle the deployment pipeline. That way users do not need to wire custom CI/CD jobs in GitHub, GitLab, or other providers. They only need to configure the build scripts until the `cf` command is stable.

## Recommended Cloudflare project settings

Use these values in the Cloudflare dashboard when the project is configured as a Worker:

- Build command: `pnpm run build`
- Deploy command: `pnpm cf deploy`
- Preview command: `pnpm cf preview`
- Root directory: `/`

These values match the scaffolded project layout: the repo root is the Worker root, the app entrypoint is `./app/entry.ts`, and the Cloudflare config lives in `cloudflare.config.ts` at the root.

## Why this works

spacefn does not rely on a generated `wrangler.jsonc` or on the default `npx wrangler ...` commands. Instead, it keeps the Worker configuration in `cloudflare.config.ts` and uses the `cf` CLI directly:

```ts
import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		entrypoint: "./app/entry.ts",
		name: "my-app",
		compatibilityDate: "2026-10-19",
	},
});
```

The `space()` Vite plugin adds convention-backed bindings for queues, Durable Objects, workflows, and the environment schema. Your explicit `worker.env` entries are still the authoritative bindings for app-owned values.

## Environment variables and secrets

Set runtime values in Cloudflare, not in source control:

- Local development: `.dev.vars`
- Production: Cloudflare Dashboard > Worker > Settings > Variables and Secrets
- App-defined bindings: `worker.env` in `cloudflare.config.ts`

For local development, create `.dev.vars` (do not commit it):

```dotenv
GREETING=hello
API_KEY=local-development-secret
```

For example, a secret binding is declared in `cloudflare.config.ts`, then the actual secret value is added in Cloudflare:

```ts
import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		entrypoint: "./app/entry.ts",
		name: "my-app",
		compatibilityDate: "2026-10-19",
		env: {
			API_KEY: bindings.secret(),
			DB: bindings.d1({ name: "my-app-db" }),
		},
	},
});
```

The `app/env.ts` schema validates the value for the app at runtime; it does not replace the Cloudflare secret configuration step. See [Cloudflare setup](./cloudflare-v2.md) and [Environment](../directory-structure/env.md).

For production, open the Worker's **Settings → Variables and Secrets** in the
Cloudflare Dashboard and add the `API_KEY` secret value there. The code only
declares the binding name and kind; it does not contain the production value.
Do not copy a production secret into `.dev.vars`, `cloudflare.config.ts`, or
the repository.

## Preview and release flow

A practical flow is:

1. Run `pnpm dev` locally while iterating.
2. Set non-secret local env values in `.dev.vars`.
3. Run `pnpm run build` to confirm the Worker bundle succeeds.
4. Run `pnpm cf preview` to test a preview deployment.
5. When ready, run `pnpm cf deploy` to publish to production.

If you prefer the built-in wrapper, `pnpm exec space deploy` is equivalent to the project build + Cloudflare deploy flow, but the Cloudflare dashboard settings above remain the simplest way to wire up the deployment pipeline.

## Before deploying

- Confirm the Dashboard uses build `pnpm run build`, deploy `pnpm cf deploy`,
  preview `pnpm cf preview`, and root directory `/`.
- Review `worker.env` and ensure every runtime binding is declared.
- Add production secret values in Cloudflare; `app/env.ts` only validates
  values when the Worker receives them.
- Run `pnpm run build`, then preview before deploying to production.
