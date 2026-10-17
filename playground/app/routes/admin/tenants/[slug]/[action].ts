import { defineHandler } from "spacefn";
import {
	transition,
	type TenantAction,
	type TenantStatus,
	TenantTransitionError,
} from "spacefn/tenancy";

import { findTenant, setActive, setDeleted, setSuspended } from "../../../../../.space/queries";
import { migrated } from "../../../../db/migrate";

const ACTIONS = new Set<TenantAction>(["suspend", "resume", "delete", "restore"]);

/** Dev-only for this playground: there is no sign-in in front of it. */
export const POST = defineHandler(async (c) => {
	const action = c.req.param("action") as TenantAction;
	if (!ACTIONS.has(action)) return c.json({ error: "not_found" }, 404);

	const slug = c.req.param("slug") as string;
	await migrated(c.env.DB);
	const row = await findTenant(c.env.DB, { slug });
	if (!row) return c.json({ error: "not_found", message: "Tenant not found" }, 404);

	const now = Date.now();
	let next;
	try {
		next = transition(
			{ status: row.status as TenantStatus, deletedAt: row.deletedAt ?? undefined },
			action,
			now,
		);
	} catch (error) {
		if (error instanceof TenantTransitionError) {
			return c.json({ error: "conflict", message: error.message }, 409);
		}
		throw error;
	}

	if (next.status === "suspended") await setSuspended(c.env.DB, { slug });
	else if (next.status === "active") await setActive(c.env.DB, { slug });
	else await setDeleted(c.env.DB, { slug, at: next.deletedAt ?? now });
	return { slug, status: next.status };
});
