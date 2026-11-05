# Tenant-scoped data

Resolve a tenant from the request, then use its stable internal ID to address
its Durable Object. Keep tenant-owned rows in that object rather than in the
shared tenant registry.

## Resolve the tenant

In `app/entry.ts`, install the resolver on only the tenant route prefix before
registering the discovered routes:

```ts
import { findTenant } from "@space/db/main_db";
import { createApp, registerRoutes } from "@space/worker";
import { d1Executor } from "spacefn/db";
import { tenantResolver } from "spacefn/tenancy";

import schema from "./env";

const app = createApp({ env: schema });

app.use(
	"/t/*",
	tenantResolver<{ DB: D1Database }>({
		baseDomain: "example.com",
		lookup: async (env, slug) => {
			const row = await findTenant(d1Executor(env.DB), { slug });
			if (!row) return undefined;
			return {
				slug: row.slug,
				internalId: row.internalId,
				status: row.status,
			};
		},
	}),
);

registerRoutes(app);
```

`findTenant` is a generated query against a shared registry table. The
resolver rejects unknown or suspended tenants and places the active tenant on
the request context. Registering it only on `/t/*` leaves health checks and
other non-tenant routes unaffected.

## Address tenant storage

Create `app/routes/t/todos.ts`:

```ts
import { defineHandler } from "spacefn/handler";
import { currentTenant } from "spacefn/tenancy";

export const GET = defineHandler((c) => {
	const tenant = currentTenant(c);
	return c.env.DO_TENANT.getByName(tenant.internalId).listTodos();
});
```

The `Tenant` Durable Object owns its SQLite database and its `listTodos`
method runs its own migrations before querying:

```ts
import { listTodos, migrate } from "@space/db/tenant_db";
// app/durable-objects/tenant.ts
import { DurableObject } from "cloudflare:workers";
import { durableObjectExecutor } from "spacefn/db";

export class Tenant extends DurableObject {
	private ready?: Promise<unknown>;

	private migrated() {
		this.ready ??= migrate(durableObjectExecutor(this.ctx.storage));
		return this.ready;
	}

	async listTodos() {
		await this.migrated();
		return listTodos(durableObjectExecutor(this.ctx.storage), {});
	}
}
```

Use the immutable `internalId` as the Durable Object name, not the tenant
slug. Slugs can change, while the internal ID continues to address the same
tenant storage. The registry must create and retain that ID.

Tenant selection is not authorization. Authenticate the user and verify their
membership in the resolved tenant before returning tenant data. See the
[tenancy guide](../guides/tenancy.md) for registry schema, lifecycle states,
slug validation, and suspended/deleted behavior.
