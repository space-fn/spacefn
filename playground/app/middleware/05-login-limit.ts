import { clientKey, memoryRateStore, rateLimit } from "spacefn/auth";
import { defineMiddleware } from "spacefn/middleware";

/**
 * Five sign-in attempts a minute per client. The store is per isolate, which is
 * enough for development. Production needs a Durable Object store, shared by every isolate.
 */
const guard = rateLimit({
	store: memoryRateStore(),
	limit: 5,
	windowMs: 60_000,
	key: (c) => `login:${clientKey(c)}`,
});

export default defineMiddleware((c, next) =>
	c.req.method === "POST" && c.req.path === "/auth/login" ? guard(c, next) : next(),
);
