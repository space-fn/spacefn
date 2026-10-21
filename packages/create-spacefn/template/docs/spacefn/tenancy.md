# Tenancy

One app serves many tenants. Each tenant's data lives in its own Durable Object with SQLite storage. A shared D1 database holds the registry: which tenants exist and whether they may be served.

```txt
request → resolve tenant (registry in D1) → its Tenant Durable Object → its own SQLite
```

Tenant rows never enter the shared database. A query written against one tenant's storage cannot reach another tenant's rows.

## Layout

```txt
app/db/main_db/         registry (shared D1)
  migrations/0002_tenants.sql
  queries/find-tenant.sql, add-tenant.sql
app/durable-objects/    one Durable Object per tenant (or any other DO)
  tenant.ts
app/middleware/02-tenant.ts resolves the tenant for /t/ routes
app/routes/t/todos.ts   tenant-scoped handlers
```

Tenant data lives in a Durable Object, not in a special folder. The library gives you the resolution rules and the lifecycle helpers; the Durable Object itself is yours to write, using `durableObjectExecutor` for its migrations.

## Tenant names

A tenant is named by the `X-Tenant-Id` header, or by a subdomain when a base domain is set. The header wins.

- Slugs are DNS labels: 1 to 63 letters, digits or dashes, not starting or ending with a dash. Case is ignored.
- Reserved names are refused: `www`, `api`, `admin`, `app`, `auth`, `static`, `assets`, `cdn`, `mail`, `support`, `status`, `docs`.
- A subdomain names a tenant only when it is exactly one label above the base domain. `www.yourapp.com` and `eu.acme.yourapp.com` name no tenant.

## Responses

| Case                       | Status | Code          |
| -------------------------- | ------ | ------------- |
| No tenant named            | 400    | `bad_request` |
| Unknown, deleted or purged | 404    | `not_found`   |
| Suspended                  | 403    | `forbidden`   |

Deleted and purged tenants answer exactly like unknown ones, so the API does not reveal which slugs used to exist.

## Using it

```ts
// app/middleware/02-tenant.ts
import { tenantResolver } from "spacefn/tenancy";

const resolve = tenantResolver<{ DB: object }>({
	lookup: async (env, slug) => {
		const row = await findTenant(env.DB, { slug });
		return row && { slug: row.slug, internalId: row.internalId, status: row.status };
	},
});
```

```ts
// app/routes/t/todos.ts
import { currentTenant } from "spacefn/tenancy";

export const GET = defineHandler((c) => {
	const tenant = currentTenant(c);
	return c.env.TENANTS.getByName(tenant.internalId).listTodos({});
});
```

- The `lookup` function is yours. The library only needs the record it returns.
- Use the tenant's internal id for the Durable Object name, never the slug. The slug can change; the internal id must not.
- `currentTenant` throws when no resolver ran first, so a route cannot silently run without a tenant.

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

An action that breaks a rule throws `TenantTransitionError` and changes nothing. Map it to a response in your route, for example 409.

## Not yet

- The generated `Tenant` class. Today the Durable Object is yours to write. Apply its migrations before it serves anything, so a request never sees a half-migrated database, and keep the ledger so the step is idempotent.
- Purge after the grace period. `transition` has no `purge` action yet; the `purged` status is reserved for it.
- Backups. The playground declares a `BACKUPS` R2 bucket in `cloudflare.config.ts`, but no export or restore code exists. The planned shape: a daily cron exports each tenant to R2, and a purge wipes the Durable Object only after its export is in the bucket.
- Admin routes. There are no `/admin/` routes yet. When they land they need their own authentication first.
