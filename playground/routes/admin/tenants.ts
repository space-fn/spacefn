import { defineHandler } from "spacefn";
import { assertValidSlug } from "spacefn/tenancy";

import { addTenant, findTenant } from "../../.space/queries";
import { migrated } from "../../db/migrate";

/** Dev-only for this playground: there is no sign-in in front of it. */
export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ slug: string }>();
	let slug: string;
	try {
		slug = assertValidSlug(body.slug);
	} catch (error) {
		return c.json({ error: "bad_request", message: (error as Error).message }, 400);
	}
	await migrated(c.env.DB);
	if (await findTenant(c.env.DB, { slug })) return c.json({ error: "conflict" }, 409);
	await addTenant(c.env.DB, { slug, internalId: crypto.randomUUID() });
	return { created: slug };
});
