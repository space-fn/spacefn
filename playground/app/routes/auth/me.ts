import { defineHandler } from "spacefn/handler";

export const GET = defineHandler((c) => {
	const user = c.get("user");
	if (user === undefined) return c.json({ error: "unauthorized", message: "Sign in first" }, 401);
	return user;
});
