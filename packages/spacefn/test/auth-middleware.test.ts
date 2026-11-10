import { Hono } from "hono";
import { expect, test } from "vite-plus/test";

import { sessionResolver } from "../src/auth/middleware";

test("a malformed session cookie is treated as signed out, not a server error", async () => {
	const app = new Hono<{ Variables: { user?: { id: number } } }>();
	app.use(sessionResolver<object, { id: number }>({ lookup: async () => undefined }) as never);
	app.get("/", (c) => c.text(c.get("user") === undefined ? "anonymous" : "known"));

	const res = await app.request("/", { headers: { cookie: "session=%%%" } });
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("anonymous");
});
