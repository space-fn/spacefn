import type { Context } from "hono";

import { SpaceError } from "../errors";
import type { TenantRecord } from "./resolve";

/** The tenant that `tenantResolver` attached to this request. */
export function currentTenant(c: Context): TenantRecord {
	const tenant = c.get("tenant") as TenantRecord | undefined;
	if (tenant === undefined) {
		throw new SpaceError(
			"TENANT_MISSING",
			"No tenant is set: this handler needs tenantResolver() in front of it",
			{ hint: "Add tenantResolver() middleware before this handler." },
		);
	}
	return tenant;
}
