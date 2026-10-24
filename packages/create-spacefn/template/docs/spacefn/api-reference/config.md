# Config

## `cloudflare.config.ts`

Declares Cloudflare bindings. Spacefn reads it to generate types and the deploy config.

```ts
// cloudflare.config.ts
export default {
	d1: { MAIN_DB: "main_db" },
	kv: { CACHE: "cache" },
	r2: { UPLOADS: "uploads" },
};
```

## `SpaceOptions`

Pass options to the space plugin in `vite.config.ts`. The `client` field accepts Vite plugins, CSS tooling, and other Vite config for the client bundle:

```ts
import { space } from "spacefn/vite";

export default defineConfig({
	plugins: [space({ client: { plugins: [/* ... */] } })],
});
```

See [client](../directory-structure/client.md) for bundling details.
