# Tenancy API (`spacefn/tenancy`)

The module provides tenant identification, request middleware, and lifecycle
transitions. The [tenancy guide](../guides/tenancy.md) covers storage and
application-level isolation.

## Identify and authorize a tenant

`slugFromRequest(input)` returns a normalized slug or `undefined`.
`RequestTenantInput` accepts `header`, `host`, and `baseDomain`. A non-empty
header wins; otherwise only one subdomain label above `baseDomain` is used.
`www` and nested subdomains are ignored.

`decideTenant(slug, tenant)` returns a `TenantOutcome`:

| Condition                          | Refusal                |
| ---------------------------------- | ---------------------- |
| No slug could be identified        | 400 `bad_request`      |
| Unknown, deleted, or purged tenant | 404 `not_found`        |
| Suspended tenant                   | 403 `forbidden`        |
| Active tenant                      | `{ ok: true, tenant }` |

Deleted and purged tenants deliberately look like unknown tenants. A
`TenantRecord` has `slug`, `internalId`, and `status`; `TenantStatus` is
`"active" | "suspended" | "deleted" | "purged"`.

## `tenantResolver(options)`

Hono middleware reads `X-Tenant-Id` first, then the request host and optional
`baseDomain`. It calls `lookup(env, slug)`, returns the refusal JSON when the
tenant cannot serve the request, or sets `c.get("tenant")` before continuing.
`TenantOptions<Env>` contains `lookup` and optional `baseDomain`;
`TenantVariables` types the context variable.

```ts
import { tenantResolver } from "spacefn/tenancy";

app.use(
	"/*",
	tenantResolver({
		baseDomain: "example.com",
		lookup: (env, slug) => env.TENANTS.get(slug),
	}),
);
```

## Lifecycle

`transition(state, action, now)` returns a new `LifecycleState` or throws
`TenantTransitionError` for an invalid transition. Allowed actions are:

| Current state       | Action  | Result                               |
| ------------------- | ------- | ------------------------------------ |
| active              | suspend | suspended                            |
| suspended           | resume  | active                               |
| active or suspended | delete  | deleted, with `deletedAt`            |
| deleted             | restore | active, before the grace period ends |

Purged is final. `GRACE_MS` is 30 days. `isPurgeDue(state, now)` reports when
a deleted tenant may be purged. `LifecycleState` contains `status` and
optional `deletedAt`; `TenantAction` is the action union.

`isValidSlug(value)`, `assertValidSlug(value)`, and `RESERVED_SLUGS` validate
tenant names. `currentTenant()` reads the tenant from the framework's async
request context; use it only in work running under that request context.
