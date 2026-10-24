import { expect, test } from "vite-plus/test";

import { defineMiddleware } from "../src/middleware";

test("defineMiddleware returns the handler unchanged", () => {
	const handler = async () => new Response("ok");
	const out = defineMiddleware(handler as never);
	expect(out).toBe(handler);
});
