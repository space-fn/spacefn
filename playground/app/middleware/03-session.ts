import { defineMiddleware } from "spacefn";
import { sessionResolver } from "spacefn/auth";

import { findSession } from "../../.space/db/main_db";
import { migrated } from "../db/main_db/migrate";

/** Attaches the signed-in user, if any, to every request. */
const resolve = sessionResolver<{ DB: object }, { id: number; email: string }>({
	lookup: async (env, tokenHash) => {
		await migrated(env.DB);
		const row = await findSession(env.DB as never, { tokenHash });
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
