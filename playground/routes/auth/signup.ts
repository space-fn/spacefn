import { defineHandler } from "spacefn";
import { hashPassword, MAX_PASSWORD_LENGTH } from "spacefn/auth";

import { addUser, findUser } from "../../.space/queries";
import { migrated } from "../../db/migrate";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ email?: string; password?: string }>();
	const email = body.email?.trim().toLowerCase() ?? "";
	const password = body.password ?? "";
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		return c.json({ error: "bad_request", message: "Enter an email address" }, 400);
	if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
		return c.json(
			{ error: "bad_request", message: `Password must be 8 to ${MAX_PASSWORD_LENGTH} characters` },
			400,
		);
	}
	await migrated(c.env.DB);
	if (await findUser(c.env.DB, { email }))
		return c.json({ error: "conflict", message: "Email is taken" }, 409);
	await addUser(c.env.DB, { email, passwordHash: await hashPassword(password) });
	return c.json({ email }, 201);
});
