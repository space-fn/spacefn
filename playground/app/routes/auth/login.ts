import { defineHandler } from "spacefn";
import { hashPassword, newSession, sessionCookie, verifyPassword } from "spacefn/auth";

import { addSession, findUser } from "../../../.space/queries";
import { migrated } from "../../db/migrate";

/** Verified against when the email is unknown, so a miss takes as long as a hit. */
let decoy: Promise<string> | undefined;

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ email?: string; password?: string }>();
	const email = body.email?.trim().toLowerCase() ?? "";
	const password = body.password ?? "";
	await migrated(c.env.DB);
	const user = await findUser(c.env.DB, { email });
	decoy ??= hashPassword("decoy-password-never-matches");
	const checked = await verifyPassword(password || "x", user?.passwordHash ?? (await decoy));
	if (!user || !checked.valid)
		return c.json({ error: "unauthorized", message: "Wrong email or password" }, 401);

	const now = Date.now();
	const session = await newSession();
	await addSession(c.env.DB, {
		tokenHash: session.tokenHash,
		userId: user.id,
		expiresAt: now + 30 * 24 * 60 * 60 * 1000,
		lastSeenAt: now,
	});
	c.header("Set-Cookie", sessionCookie(session.token));
	return { email: user.email };
});
