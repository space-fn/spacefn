import { defineHandler } from "spacefn";
import { currentTenant } from "spacefn/tenancy";

import type { Tenant } from "../../../.space/tenant";

function tenantStub(c: { env: unknown }, slug: string) {
	return (c.env as { TENANTS: DurableObjectNamespace<Tenant> }).TENANTS.getByName(slug);
}

export const GET = defineHandler((c) => tenantStub(c, currentTenant(c).internalId).listTodos({}));

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ title: string }>();
	await tenantStub(c, currentTenant(c).internalId).addTodo({ title: body.title });
	return { created: true };
});
