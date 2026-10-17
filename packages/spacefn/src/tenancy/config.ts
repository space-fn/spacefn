import { bindings, exports } from "cf/config";

/** The binding name the Tenant Durable Object is reachable under. */
export const TENANT_BINDING = "TENANTS";

/**
 * The Worker config a `tenant/` folder implies: the `Tenant` Durable Object
 * class and the namespace binding that reaches it.
 */
export function tenantConfig(workerName: string) {
	return {
		exports: { Tenant: exports.durableObject({ storage: "sqlite" }) },
		env: {
			[TENANT_BINDING]: bindings.durableObject({ worker: workerName, exportName: "Tenant" }),
		},
	};
}
