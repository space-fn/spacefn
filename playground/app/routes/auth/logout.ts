import { defineHandler } from "spacefn";
import { clearSessionCookie, hashSessionToken, readCookie } from "spacefn/auth";

import { deleteSession } from "../../../.space/db/main_db";
import { migrated } from "../../db/main_db/migrate";

export const POST = defineHandler(async (c) => {
	const token = readCookie(c.req.header("cookie"));
	if (token) {
		await migrated(c.env.DB);
		await deleteSession(c.env.DB, { tokenHash: await hashSessionToken(token) });
	}
	c.header("Set-Cookie", clearSessionCookie());
	return { signedOut: true };
});
