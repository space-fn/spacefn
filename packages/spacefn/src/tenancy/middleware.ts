import type { Context, MiddlewareHandler } from "hono";

import { decideTenant, slugFromRequest, type TenantRecord } from "./resolve";

export interface TenantOptions<Env> {
	/** Base domain for subdomain tenants, e.g. `yourapp.com`. Empty means header only. */
	baseDomain?: string;
	/** Finds a tenant by slug in the app's registry. Returns `undefined` when there is none. */
	lookup: (env: Env, slug: string) => Promise<TenantRecord | undefined>;
}

/** The context variable the resolver sets. */
export interface TenantVariables {
	tenant: TenantRecord;
}

/**
 * Resolves the tenant for a request and stores it as `c.get("tenant")`. A request
 * that cannot be served gets a JSON refusal and never reaches the handlers below.
 */
export function tenantResolver<Env extends object>(
	options: TenantOptions<Env>,
): MiddlewareHandler<{
	Bindings: Env;
	Variables: TenantVariables;
}> {
	return async (c, next) => {
		const slug = slugFromRequest({
			header: c.req.header("x-tenant-id"),
			// The URL is the reliable source of the host; a Host header may be absent.
			host: new URL(c.req.url).host,
			baseDomain: options.baseDomain,
		});
		const tenant = slug === undefined ? undefined : await options.lookup(c.env, slug);
		const outcome = decideTenant(slug, tenant);
		if (!outcome.ok) {
			return refuse(c, outcome);
		}
		c.set("tenant", outcome.tenant);
		await next();
	};
}

function refuse(c: Context, refusal: { status: 400 | 403 | 404; code: string; message: string }) {
	return c.json({ error: refusal.code, message: refusal.message }, refusal.status);
}
