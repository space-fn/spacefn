import type { Context } from "hono";

import type { TenantRecord } from "./resolve";

/** The tenant that `tenantResolver` attached to this request. */
export function currentTenant(c: Context): TenantRecord {
	const tenant = c.get("tenant") as TenantRecord | undefined;
	if (tenant === undefined) {
		throw new Error("No tenant is set: this handler needs tenantResolver() in front of it");
	}
	return tenant;
}
