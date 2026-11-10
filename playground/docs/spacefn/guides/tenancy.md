# Tenancy

One app serves many tenants. Tenant-owned application data can live in a
Durable Object with SQLite storage. A shared D1 database holds the registry:
which tenants exist and whether they may be served. The tenant registry itself
is shared data; tenant-owned rows belong in the tenant's storage.

```txt
request → resolve tenant (registry in D1) → its Tenant Durable Object → its own SQLite
```

Tenant-owned rows never enter the shared database. A query written against one
tenant's storage cannot reach another tenant's rows.

## Layout

```txt
app/db/main_db/         registry (shared D1)
  migrations/0002_tenants.sql
  queries/find-tenant.sql, add-tenant.sql
app/durable-objects/    one Durable Object per tenant (or any other DO)
  tenant.ts
app/entry.ts scopes tenant resolution to /t/*
app/routes/t/todos.ts   tenant-scoped handlers
```

Tenant data lives in a Durable Object, not in a special folder. The library gives you the resolution rules and the lifecycle helpers; the Durable Object itself is yours to write, using `durableObjectExecutor` for its migrations.

## Tenant names

A tenant is named by a subdomain when a base domain is set. The `X-Tenant-Id` header counts only when you pass `allowTenantHeader: true`, and then it wins. Leave it off unless a gateway you control sets the header.

- Slugs are DNS labels: 1 to 63 letters, digits or dashes, not starting or ending with a dash. Case is ignored.
- `assertValidSlug()` refuses reserved names: `www`, `api`, `admin`, `app`, `apps`, `auth`, `static`, `assets`, `cdn`, `mail`, `support`, `status`, `docs`.
- A subdomain names a tenant only when it is exactly one label above the base domain. `www.yourapp.com` and `eu.acme.yourapp.com` name no tenant.
- Use `assertValidSlug()` when creating or renaming a tenant. `tenantResolver()` normalizes the incoming header or subdomain and calls your `lookup`; it does not create tenants or enforce reserved-name policy for your registry.

## Responses

| Case                       | Status | Code          |
| -------------------------- | ------ | ------------- |
| No tenant named            | 400    | `bad_request` |
| Unknown, deleted or purged | 404    | `not_found`   |
| Suspended                  | 403    | `forbidden`   |

Deleted and purged tenants answer exactly like unknown ones, so the API does not reveal which slugs used to exist.

## Using it

The resolver is framework middleware, so it is wired in `app/entry.ts`. Its
`lookup` calls a module that reads the registry; see `tenantBySlug` in the
[tenant-scoped data example](../examples/tenant-scoped-data.md#read-the-registry).

```ts
// app/entry.ts excerpt: register this before registerRoutes(app)

import { mainDb } from "@app/db/main_db";
import { tenantBySlug } from "@modules/tenants";
import { createApp, registerRoutes } from "@space/worker";
import { tenantResolver } from "spacefn/tenancy";

import schema from "./env";

const app = createApp({ env: schema });
app.use(
	"/t/*",
	tenantResolver<{ DB: D1Database }>({
		baseDomain: "yourapp.com",
		lookup: async (env, slug) => tenantBySlug(await mainDb(env.DB), slug),
	}),
);
registerRoutes(app);
```

```ts
// app/routes/t/todos.ts

import { defineHandler } from "spacefn/handler";
import { currentTenant } from "spacefn/tenancy";

export const GET = defineHandler((c) => {
	const tenant = currentTenant(c);
	return c.env.DO_TENANT.getByName(tenant.internalId).listTodos();
});
```

- The `lookup` function is yours: a module function that returns the record. The library only needs that record.
- Use the tenant's internal id for the Durable Object name, never the slug. The slug can change; the internal id must not.
- `currentTenant` throws when no resolver ran first, so a route cannot silently run without a tenant.
- A middleware file is global to the app. Scope `tenantResolver` to the tenant route prefix, as above, or it will reject requests to non-tenant routes too.
- Tenant selection is not authorization. Authenticate the user and check that they may access the resolved tenant before returning tenant data.

## Tracing

Each stub call is a `do.call` span with the binding and the method name. Migrations are a `db.migrate` span.

## Lifecycle

Actions on a tenant follow fixed rules, enforced by `transition` in `spacefn/tenancy`:

| From              | Action  | To        | Notes                                       |
| ----------------- | ------- | --------- | ------------------------------------------- |
| active            | suspend | suspended | Requests get 403                            |
| suspended         | resume  | active    |                                             |
| active, suspended | delete  | deleted   | Requests get 404. Data is kept for 30 days. |
| deleted           | restore | active    | Only within the 30 days. Data is intact.    |

An action that breaks a rule throws `TenantTransitionError` and changes
nothing. Deciding whether a tenant may be suspended is a rule, so a module
calls `transition` (a request-free helper) and reports a refusal as an
`AppError`, which `app.onError` answers with 409:

```ts
// modules/tenants/lifecycle.ts

import { findTenantById, updateTenantLifecycle } from "@space/db/main_db";
import { AppError } from "@utils/errors";
import type { DbReader } from "spacefn/db";
import { TenantTransitionError, transition, type TenantStatus } from "spacefn/tenancy";

export async function suspendTenant(db: DbReader, id: string, now: number) {
	const tenant = await findTenantById(db, { id });
	if (!tenant) throw new AppError("not_found", "No such tenant.");
	let next;
	try {
		next = transition({ status: tenant.status as TenantStatus }, "suspend", now);
	} catch (error) {
		if (error instanceof TenantTransitionError) {
			throw new AppError("conflict", error.message, "invalid_transition");
		}
		throw error;
	}
	await updateTenantLifecycle(db, { id: tenant.internalId, status: next.status });
	return { status: next.status };
}
```

The route only reads the id and the clock:

```ts
// app/routes/admin/tenants/[id]/suspend.ts

import { mainDb } from "@app/db/main_db";
import { suspendTenant } from "@modules/tenants/lifecycle";
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) =>
	suspendTenant(await mainDb(c.env.DB), c.req.param("id") ?? "", Date.now()),
);
```

`findTenantById` and `updateTenantLifecycle` are generated queries, and this
route must be protected by admin authorization. In real code, include
`deletedAt` when passing a deleted record into `transition`; the lifecycle
helper needs it to enforce the restore grace period.

## Not yet

- The generated `Tenant` class. Today the Durable Object is yours to write. Apply its migrations before it serves anything, so a request never sees a half-migrated database, and keep the ledger so the step is idempotent.
- Purge after the grace period. `transition` has no `purge` action yet; the `purged` status is reserved for it.
- Backups. No export or restore code exists yet. The planned shape: a daily cron exports each tenant to R2, and a purge wipes the Durable Object only after its export is in the bucket. Declare an R2 bucket (for example `BACKUPS`) in `cloudflare.config.ts` when you add this.
- Admin routes. There are no `/admin/` routes yet. When they land they need their own authentication first.
