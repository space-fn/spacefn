import { deleteSession } from "@space/db/main_db";
import { migrated } from "@space/db/main_db";
import { defineHandler } from "spacefn";
import { clearSessionCookie, hashSessionToken, readCookie } from "spacefn/auth";
import { d1Executor } from "spacefn/db";

export const POST = defineHandler(async (c) => {
	const token = readCookie(c.req.header("cookie"));
	if (token) {
		await migrated(c.env.DB);
		await deleteSession(d1Executor(c.env.DB), { tokenHash: await hashSessionToken(token) });
	}
	c.header("Set-Cookie", clearSessionCookie());
	return { signedOut: true };
});
