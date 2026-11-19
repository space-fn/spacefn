import { findSession, touchSession } from "@space/db/main_db";
import { migrated } from "@space/db/main_db";
import { sessionResolver } from "spacefn/auth";
import { d1Executor } from "spacefn/db";
import type { AppBindings } from "spacefn/env";
import { defineMiddleware } from "spacefn/middleware";

/** Attaches the signed-in user, if any, to every request. */
const resolve = sessionResolver<AppBindings, { id: number; email: string }>({
	lookup: async (env, tokenHash) => {
		await migrated(env.DB);
		const row = await findSession(d1Executor(env.DB), { tokenHash });
		return (
			row && {
				user: { id: row.userId, email: row.email },
				expiresAt: row.expiresAt,
				lastSeenAt: row.lastSeenAt,
			}
		);
	},
	touch: async (env, tokenHash, lastSeenAt) => {
		await touchSession(d1Executor(env.DB), { tokenHash, lastSeenAt });
	},
});

export default defineMiddleware(resolve);
