export type TenantStatus = "active" | "suspended" | "deleted" | "purged";

export interface TenantRecord {
	slug: string;
	internalId: string;
	status: TenantStatus;
}

export interface RequestTenantInput {
	/** The `Host` header, with or without a port. */
	host?: string | null;
	/** The `X-Tenant-Id` header. Takes precedence over the host. */
	header?: string | null;
	/** The base domain, e.g. `yourapp.com`. Empty disables subdomain tenants. */
	baseDomain?: string;
}

/**
 * Finds the slug a request names. The header wins. Otherwise the host must be
 * exactly one label above the base domain: `acme.yourapp.com` is `acme`, but
 * `www.yourapp.com` and `eu.acme.yourapp.com` name no tenant.
 */
export function slugFromRequest(input: RequestTenantInput): string | undefined {
	if (input.header && input.header.trim() !== "") return input.header.trim().toLowerCase();

	const base = (input.baseDomain ?? "").toLowerCase().replace(/^\.+|\.+$/g, "");
	const host = (input.host ?? "").toLowerCase().replace(/:\d+$/, "");
	if (base === "" || !host.endsWith(`.${base}`)) return undefined;

	const label = host.slice(0, -(base.length + 1));
	if (label === "" || label.includes(".") || label === "www") return undefined;
	return label;
}

/** What a request gets back when its tenant cannot be served. */
export interface TenantRefusal {
	status: 400 | 403 | 404;
	code: "bad_request" | "forbidden" | "not_found";
	message: string;
}

export type TenantOutcome = { ok: true; tenant: TenantRecord } | ({ ok: false } & TenantRefusal);

/**
 * Decides whether a looked-up tenant may serve the request. Deleted and purged
 * tenants answer exactly like unknown ones, so the API never reveals which
 * slugs used to exist.
 */
export function decideTenant(
	slug: string | undefined,
	tenant: TenantRecord | undefined,
): TenantOutcome {
	if (slug === undefined) {
		return { ok: false, status: 400, code: "bad_request", message: "No tenant was named" };
	}
	if (tenant === undefined || tenant.status === "deleted" || tenant.status === "purged") {
		return { ok: false, status: 404, code: "not_found", message: "Tenant not found" };
	}
	if (tenant.status === "suspended") {
		return { ok: false, status: 403, code: "forbidden", message: "Tenant is suspended" };
	}
	return { ok: true, tenant };
}
