import { defineMiddleware } from "spacefn";
import { sessionResolver } from "spacefn/auth";

import type { AppBindings } from "spacefn/env";

import { findSession } from "@space/db/main_db";
import { migrated } from "@space/db/main_db";

/** Attaches the signed-in user, if any, to every request. */
const resolve = sessionResolver<AppBindings, { id: number; email: string }>({
	lookup: async (env, tokenHash) => {
		await migrated(env.DB);
		const row = await findSession(env.DB, { tokenHash });
		return (
			row && {
				user: { id: row.userId, email: row.email },
				expiresAt: row.expiresAt,
				lastSeenAt: row.lastSeenAt,
			}
		);
	},
});

export default defineMiddleware(resolve);
