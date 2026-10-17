# Tenancy

One app serves many tenants. Each tenant's data lives in its own SQLite database, a `Tenant` Durable Object. A shared D1 database holds the registry: which tenants exist and whether they may be served.

```txt
request → resolve tenant (registry in D1) → its Tenant Durable Object → its own SQLite
```

Tenant rows never enter the shared database. A query written against one tenant's storage cannot reach another tenant's rows.

## Layout

```txt
db/                     registry (shared D1)
  migrations/0002_tenants.sql
  queries/find-tenant.sql, add-tenant.sql
tenant/                 one database per tenant
  migrations/0001_todos.sql
  queries/list-todos.sql, add-todo.sql
middleware/02-tenant.ts resolves the tenant for /t/ routes
routes/t/todos.ts       tenant-scoped handlers
```

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
// middleware/02-tenant.ts
import { tenantResolver } from "spacefn/tenancy";

const resolve = tenantResolver<{ DB: object }>({
	lookup: async (env, slug) => {
		const row = await findTenant(env.DB, { slug });
		return row && { slug: row.slug, internalId: row.internalId, status: row.status };
	},
});
```

```ts
// routes/t/todos.ts
import { currentTenant } from "spacefn/tenancy";

export const GET = defineHandler((c) => {
	const tenant = currentTenant(c);
	return c.env.TENANTS.getByName(tenant.internalId).listTodos({});
});
```

- The `lookup` function is yours. The library only needs the record it returns.
- Use the tenant's internal id for the Durable Object name, never the slug. The slug can change; the internal id must not.
- `currentTenant` throws when no resolver ran first, so a route cannot silently run without a tenant.

## The Tenant class

Generated from `tenant/`. Each query becomes a method on it:

```ts
const stub = c.env.TENANTS.getByName(internalId);
await stub.addTodo({ title: "write docs" });
await stub.listTodos({});
```

- The class applies its migrations before it serves anything. It uses `blockConcurrencyWhile`, so a request never sees a half-migrated database. The ledger makes the step idempotent.
- The binding is `TENANTS`. The config declares the class and the binding when a `tenant/` folder exists.
- The entry must export the class. The generated `.space/worker.ts` does; a hand-written entry must re-export `Tenant` as well. A missing export fails at startup with `Class extends value undefined`.
- Query names may not match a Durable Object method (`fetch`, `alarm`, and so on).

## Tracing

Each stub call is a `do.call` span with the binding and the method name. Migrations are a `db.migrate` span.

## Not yet

- Lifecycle: suspend, soft delete with a grace period, and purge after export. The status rules are in place; the transitions are not.
- Backups to R2.
- Admin authentication. The playground's `/admin/tenants` route is open, for development only.
