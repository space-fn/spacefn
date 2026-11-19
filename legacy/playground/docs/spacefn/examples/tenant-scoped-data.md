# Tenant-scoped data

Resolve a tenant from the request, then use its stable internal ID to address
its Durable Object. Keep tenant-owned rows in that object rather than in the
shared tenant registry.

The resolver, route, and Durable Object are setup. Reading the registry and
the tenant's rows are module functions that take an executor, so the same
code runs against D1, a Durable Object's SQLite, or a test database.

## Read the registry

```ts
// modules/tenants/registry.ts

import { findTenant } from "@space/db/main_db";
import type { DbReader } from "spacefn/db";
import type { TenantRecord, TenantStatus } from "spacefn/tenancy";

const STATUSES: readonly string[] = ["active", "suspended", "deleted", "purged"];

export async function tenantBySlug(db: DbReader, slug: string): Promise<TenantRecord | undefined> {
	const row = await findTenant(db, { slug });
	if (!row) return undefined;
	if (!STATUSES.includes(row.status)) throw new Error(`Unknown tenant status: ${row.status}`);
	return { slug: row.slug, internalId: row.internalId, status: row.status as TenantStatus };
}
```

`findTenant` is a generated query against a shared registry table. The module
imports only types from `spacefn/tenancy`, so it still runs without the
framework.

## Resolve the tenant

In `app/entry.ts`, install the resolver on only the tenant route prefix before
registering the discovered routes. The resolver is framework middleware; its
lookup calls the module:

```ts
// app/entry.ts

import { mainDb } from "@app/db/main_db";
import { tenantBySlug } from "@modules/tenants";
import { createApp, registerRoutes } from "@space/worker";
import { tenantResolver } from "spacefn/tenancy";

import schema from "./env";

const app = createApp({ env: schema });

app.use(
	"/t/*",
	tenantResolver<{ DB: D1Database }>({
		baseDomain: "example.com",
		lookup: async (env, slug) => tenantBySlug(await mainDb(env.DB), slug),
	}),
);

registerRoutes(app);
```

The resolver rejects unknown or suspended tenants and places the active tenant
on the request context. Registering it only on `/t/*` leaves health checks and
other non-tenant routes unaffected.

## Address tenant storage

The route forwards to the tenant's object:

```ts
// app/routes/t/todos.ts

import { defineHandler } from "spacefn/handler";
import { currentTenant } from "spacefn/tenancy";

export const GET = defineHandler((c) => {
	const tenant = currentTenant(c);
	return c.env.DO_TENANT.getByName(tenant.internalId).listTodos();
});
```

The tenant's rows are read by a module that knows nothing about Durable
Objects:

```ts
// modules/tenants/todos.ts

import { listTodos } from "@space/db/tenant_db";
import type { DbReader } from "spacefn/db";

export function tenantTodos(db: DbReader) {
	return listTodos(db, {});
}
```

```ts
// modules/tenants/index.ts

export { tenantBySlug } from "./registry";
export { tenantTodos } from "./todos";
```

The `Tenant` Durable Object owns its SQLite database. It runs its own
migrations, then hands its storage to the module:

```ts
// app/durable-objects/tenant.ts

import { tenantTodos } from "@modules/tenants";
import { migrate } from "@space/db/tenant_db";
import { DurableObject } from "cloudflare:workers";
import { durableObjectExecutor } from "spacefn/db";

export class Tenant extends DurableObject {
	private ready?: Promise<unknown>;

	private async db() {
		const executor = durableObjectExecutor(this.ctx.storage);
		this.ready ??= migrate(executor);
		await this.ready;
		return executor;
	}

	async listTodos() {
		return tenantTodos(await this.db());
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
