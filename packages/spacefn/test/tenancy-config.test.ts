import { expect, test } from "vitest";

import { tenantConfig, TENANT_BINDING } from "../src/tenancy/config";

test("declares the Tenant class and a namespace binding to it", () => {
	const config = tenantConfig("shop");
	expect(config.exports.Tenant).toMatchObject({ type: "durable-object", storage: "sqlite" });
	expect(config.env[TENANT_BINDING]).toMatchObject({
		type: "durable-object",
		worker: "shop",
		exportName: "Tenant",
	});
});
