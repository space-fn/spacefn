import { Hono } from "hono";
import { expect, test } from "vite-plus/test";

import { currentTenant, tenantResolver, type TenantRecord } from "../src/tenancy";

const acme: TenantRecord = { slug: "acme", internalId: "id-acme", status: "active" };

test("a handler reads the tenant the resolver attached", async () => {
	const app = new Hono();
	app.use(
		tenantResolver({
			lookup: async (_env: unknown, slug: string) => (slug === "acme" ? acme : undefined),
		}),
	);
	app.get("/", (c) => c.json(currentTenant(c)));
	const res = await app.request("/", { headers: { "x-tenant-id": "acme" } });
	expect(await res.json()).toEqual(acme);
});

test("reading the tenant without a resolver is a loud error", async () => {
	const app = new Hono();
	app.get("/", (c) => c.json(currentTenant(c)));
	const res = await app.request("/");
	expect(res.status).toBe(500);
});
