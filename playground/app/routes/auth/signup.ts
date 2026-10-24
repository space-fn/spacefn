import { addUser, findUser } from "@space/db/main_db";
import { migrated } from "@space/db/main_db";
import {
	hashPassword,
	hibpBreachCheck,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
} from "spacefn/auth";
import { d1Executor } from "spacefn/db";
import { defineHandler } from "spacefn/handler";

export const POST = defineHandler(async (c) => {
	const body = await c.req.json<{ email?: string; password?: string }>();
	const email = body.email?.trim().toLowerCase() ?? "";
	const password = body.password ?? "";
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		return c.json({ error: "bad_request", message: "Enter an email address" }, 400);
	if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
		return c.json(
			{
				error: "bad_request",
				message: `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`,
			},
			400,
		);
	}
	await migrated(c.env.DB);
	if (await findUser(d1Executor(c.env.DB), { email }))
		return c.json({ error: "conflict", message: "Email is taken" }, 409);
	let passwordHash: string;
	try {
		passwordHash = await hashPassword(password, {
			pepper: c.env.PASSWORD_PEPPER,
			breachCheck: hibpBreachCheck(),
		});
	} catch (error) {
		return c.json(
			{ error: "bad_request", message: error instanceof Error ? error.message : "Weak password" },
			400,
		);
	}
	await addUser(d1Executor(c.env.DB), { email, passwordHash });
	return c.json({ email }, 201);
});
