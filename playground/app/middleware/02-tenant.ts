import { defineMiddleware } from "spacefn";
import { tenantResolver, type TenantStatus } from "spacefn/tenancy";

import { findTenant } from "../../.space/queries";
import { migrated } from "../db/migrate";

const resolve = tenantResolver<{ DB: object }>({
	lookup: async (env, slug) => {
		await migrated(env.DB);
		const row = await findTenant(env.DB as never, { slug });
		return (
			row && { slug: row.slug, internalId: row.internalId, status: row.status as TenantStatus }
		);
	},
});

/** Tenant routes live under `/t/`. Every other route runs without a tenant. */
export default defineMiddleware((c, next) =>
	c.req.path.startsWith("/t/") ? resolve(c, next) : next(),
);
