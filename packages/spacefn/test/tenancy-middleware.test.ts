import { Hono } from "hono";
import { expect, test } from "vite-plus/test";

import { tenantResolver, type TenantRecord, type TenantVariables } from "../src/tenancy";

type Env = { DB: Map<string, TenantRecord> };

const records = new Map<string, TenantRecord>([
	["acme", { slug: "acme", internalId: "id-acme", status: "active" }],
	["paused", { slug: "paused", internalId: "id-paused", status: "suspended" }],
	["gone", { slug: "gone", internalId: "id-gone", status: "deleted" }],
]);

function appWith() {
	const app = new Hono<{ Bindings: Env; Variables: TenantVariables }>();
	app.use(
		tenantResolver<Env>({
			baseDomain: "yourapp.com",
			lookup: async (env, slug) => env.DB.get(slug),
		}),
	);
	app.get("/whoami", (c) => c.json({ tenant: c.get("tenant").internalId }));
	return app;
}

const env = { DB: records };

test("serves an active tenant named by the header", async () => {
	const res = await appWith().request("/whoami", { headers: { "x-tenant-id": "acme" } }, env);
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ tenant: "id-acme" });
});

test("serves an active tenant named by the subdomain", async () => {
	const res = await appWith().request("http://acme.yourapp.com/whoami", {}, env);
	expect(await res.json()).toEqual({ tenant: "id-acme" });
});

test("refuses a request that names no tenant with 400", async () => {
	const res = await appWith().request("http://www.yourapp.com/whoami", {}, env);
	expect(res.status).toBe(400);
	expect(await res.json()).toEqual({ error: "bad_request", message: "No tenant was named" });
});

test("refuses an unknown tenant with 404", async () => {
	const res = await appWith().request("/whoami", { headers: { "x-tenant-id": "nobody" } }, env);
	expect(res.status).toBe(404);
});

test("deleted tenants answer exactly like unknown ones", async () => {
	const unknown = await appWith().request("/whoami", { headers: { "x-tenant-id": "nobody" } }, env);
	const deleted = await appWith().request("/whoami", { headers: { "x-tenant-id": "gone" } }, env);
	expect(deleted.status).toBe(unknown.status);
	expect(await deleted.json()).toEqual(await unknown.json());
});

test("refuses a suspended tenant with 403", async () => {
	const res = await appWith().request("/whoami", { headers: { "x-tenant-id": "paused" } }, env);
	expect(res.status).toBe(403);
});

test("does not call the registry when no tenant is named", async () => {
	let calls = 0;
	const app = new Hono<{ Bindings: Env; Variables: TenantVariables }>();
	app.use(
		tenantResolver<Env>({
			lookup: async () => {
				calls++;
				return undefined;
			},
		}),
	);
	app.get("/", (c) => c.text("ok"));
	await app.request("/", {}, env);
	expect(calls).toBe(0);
});
